package com.oddsdex.app.ui.chart

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.ui.theme.JetBrainsMonoFamily
import com.oddsdex.app.ui.theme.OddsdexColors
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Real-time odds line chart, styled after the onboarding reference.
 *
 * Motion design (the "natural" feel):
 * - Time scrolls continuously per frame, not per tick: `now` advances with the
 *   frame clock between ticks, so the series glides left instead of stepping.
 * - The line head eases toward the latest tick value (quadratic ease-out over
 *   the tick interval) instead of jumping to it.
 * - The y-scale follows min/max through exponential smoothing, so autoscale
 *   drifts instead of snapping.
 *
 * Ticks invalidate drawing only (state read in the draw phase) — never
 * recomposition. Series data is copied into pre-allocated arrays.
 */
/**
 * [topInsetPx]/[bottomInsetPx] reserve space (header, coach sheet): the series
 * band is mapped between them so the line, pill and labels stay visible, while
 * the gradient area fill bleeds to the bottom edge — the chart reads as
 * occupying the whole screen behind the overlays.
 */
@Composable
fun OddsChart(
    buffer: SeriesBuffer,
    entryOdd: Double?,
    topInsetPx: Float,
    bottomInsetPx: Float,
    modifier: Modifier = Modifier,
) {
    val textMeasurer = rememberTextMeasurer()
    var frame by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) {
        while (true) {
            withFrameNanos { frame = it }
        }
    }
    val outOdds = remember { DoubleArray(SeriesBuffer.DEFAULT_CAPACITY) }
    val outTimes = remember { LongArray(SeriesBuffer.DEFAULT_CAPACITY) }
    val motion = remember { ChartMotion() }

    Spacer(
        modifier = modifier
            .fillMaxSize()
            .drawBehind {
                val frameNanos = frame // draw-phase read: redraw every frame
                val n = buffer.snapshotInto(outOdds, outTimes)
                if (n < 2) return@drawBehind
                motion.update(frameNanos, n, outOdds, outTimes)
                drawChart(
                    n, outOdds, outTimes, entryOdd, motion, textMeasurer,
                    bandTop = topInsetPx,
                    bandBottom = (size.height - bottomInsetPx).coerceAtLeast(topInsetPx + 1f),
                )
            },
    )
}

/**
 * Per-frame interpolation state. Mutated only from the draw pass.
 *
 * The head follows the newest tick through a critically damped spring, which
 * keeps velocity continuous across tick arrivals (no per-tick restarts), and
 * the y-range follows min/max through a dt-based exponential filter — both
 * scale correctly with the real frame delta (60/120 Hz alike).
 */
private class ChartMotion {
    var nowMillis = 0L            // continuous clock in series time
    var headOdd = 0.0             // spring-smoothed head value
    var displayMin = Double.NaN   // smoothed y-range
    var displayMax = Double.NaN
    private var lastTickTs = -1L
    private var frameNanosAtTick = 0L
    private var lastFrameNanos = -1L
    private var dtSeconds = 0.0
    private var headVelocity = 0.0 // odd units per second

    fun update(frameNanos: Long, n: Int, odds: DoubleArray, times: LongArray) {
        dtSeconds = if (lastFrameNanos < 0) 0.0
        else ((frameNanos - lastFrameNanos) / 1e9).coerceIn(0.0, 0.1)
        lastFrameNanos = frameNanos

        val lastTs = times[n - 1]
        val target = odds[n - 1]
        if (lastTs != lastTickTs) {
            if (lastTickTs < 0) headOdd = target // first frame: no animation
            lastTickTs = lastTs
            frameNanosAtTick = frameNanos
        }

        // Critically damped spring toward the newest tick value.
        val exp = kotlin.math.exp(-SPRING_OMEGA * dtSeconds)
        val x = headOdd - target
        val tempo = (headVelocity + SPRING_OMEGA * x) * dtSeconds
        headOdd = target + (x + tempo) * exp
        headVelocity = (headVelocity - SPRING_OMEGA * tempo) * exp

        // Continuous scroll clock, clamped so a stalled source doesn't run away.
        val sinceTickMs = (frameNanos - frameNanosAtTick) / 1_000_000f
        nowMillis = lastTs + min(sinceTickMs, MAX_EXTRAPOLATION_MILLIS).toLong()
    }

    fun smoothRange(targetMin: Double, targetMax: Double) {
        if (displayMin.isNaN()) {
            displayMin = targetMin
            displayMax = targetMax
        } else {
            val alpha = 1.0 - kotlin.math.exp(-dtSeconds / RANGE_TAU_SECONDS)
            displayMin += (targetMin - displayMin) * alpha
            displayMax += (targetMax - displayMax) * alpha
        }
    }

    private companion object {
        const val MAX_EXTRAPOLATION_MILLIS = 400f
        const val SPRING_OMEGA = 16.0    // rad/s — settles in ~250 ms, organic
        const val RANGE_TAU_SECONDS = 0.30
    }
}

private const val VISIBLE_WINDOW_MILLIS = 45_000L
private const val LAST_POINT_X_FRACTION = 0.62f // head sits here; pill at right edge

private fun DrawScope.drawChart(
    n: Int,
    odds: DoubleArray,
    times: LongArray,
    entryOdd: Double?,
    motion: ChartMotion,
    textMeasurer: TextMeasurer,
    bandTop: Float,
    bandBottom: Float,
) {
    val now = motion.nowMillis
    val windowStart = now - VISIBLE_WINDOW_MILLIS
    var first = 0
    while (first < n - 1 && times[first] < windowStart) first++

    var minOdd = motion.headOdd
    var maxOdd = motion.headOdd
    for (i in first until n) {
        minOdd = min(minOdd, odds[i])
        maxOdd = max(maxOdd, odds[i])
    }
    if (entryOdd != null) {
        minOdd = min(minOdd, entryOdd)
        maxOdd = max(maxOdd, entryOdd)
    }
    val span = max(0.02, maxOdd - minOdd)
    motion.smoothRange(minOdd - span * 0.10, maxOdd + span * 0.10)
    val rangeMin = motion.displayMin
    val rangeMax = motion.displayMax

    val bandHeight = bandBottom - bandTop
    val lastX = size.width * LAST_POINT_X_FRACTION
    fun xFor(t: Long): Float =
        lastX - (now - t).toFloat() / VISIBLE_WINDOW_MILLIS * lastX
    fun yFor(odd: Double): Float =
        bandTop + (bandHeight * (1.0 - (odd - rangeMin) / (rangeMax - rangeMin))).toFloat()

    drawGridAndLabels(rangeMin, rangeMax, textMeasurer, ::yFor)

    // Area fill + series line; head is the eased value pinned at lastX.
    val line = Path()
    val area = Path()
    val x0 = xFor(times[first])
    val y0 = yFor(odds[first])
    line.moveTo(x0, y0)
    area.moveTo(x0, size.height)
    area.lineTo(x0, y0)
    for (i in first + 1 until n - 1) {
        val x = xFor(times[i])
        val y = yFor(odds[i])
        line.lineTo(x, y)
        area.lineTo(x, y)
    }
    val headY = yFor(motion.headOdd)
    line.lineTo(lastX, headY)
    area.lineTo(lastX, headY)
    area.lineTo(lastX, size.height)
    area.close()
    drawPath(
        area,
        brush = Brush.verticalGradient(
            colors = listOf(
                OddsdexColors.SeriesCyan.copy(alpha = 0.22f),
                OddsdexColors.SeriesCyan.copy(alpha = 0.02f),
            ),
        ),
    )
    drawPath(line, OddsdexColors.SeriesCyan, style = Stroke(width = 2.dp.toPx()))

    if (entryOdd != null) drawEntryLine(entryOdd, ::yFor)
    drawValuePill(motion.headOdd, lastX, headY, textMeasurer)
}

private fun DrawScope.drawGridAndLabels(
    minOdd: Double,
    maxOdd: Double,
    textMeasurer: TextMeasurer,
    yFor: (Double) -> Float,
) {
    val step = niceStep(maxOdd - minOdd)
    var v = ceil(minOdd / step) * step
    val labelStyle = TextStyle(
        color = OddsdexColors.AxisLabel,
        fontSize = 13.sp,
        fontFamily = JetBrainsMonoFamily,
    )
    while (v <= maxOdd) {
        val y = yFor(v)
        drawLine(
            OddsdexColors.GridLine,
            start = Offset(0f, y),
            end = Offset(size.width, y),
            strokeWidth = 1f,
        )
        val text = String.format(Locale.US, "%.2f", v)
        val measured = textMeasurer.measure(text, labelStyle)
        drawText(
            measured,
            topLeft = Offset(
                size.width - measured.size.width - 8.dp.toPx(),
                y - measured.size.height - 3.dp.toPx(),
            ),
        )
        v += step
    }
}

private fun niceStep(span: Double): Double {
    val raw = span / 5
    val candidates = doubleArrayOf(0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0)
    for (c in candidates) if (raw <= c) return c
    return floor(raw)
}

private fun DrawScope.drawEntryLine(entryOdd: Double, yFor: (Double) -> Float) {
    val y = yFor(entryOdd)
    drawLine(
        OddsdexColors.EntryLine,
        start = Offset(0f, y),
        end = Offset(size.width, y),
        strokeWidth = 1.dp.toPx(),
        pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 10f)),
    )
}

private fun DrawScope.drawValuePill(
    odd: Double,
    lastX: Float,
    lastY: Float,
    textMeasurer: TextMeasurer,
) {
    val text = String.format(Locale.US, "%.2f", odd)
    val measured = textMeasurer.measure(
        text,
        TextStyle(
            color = OddsdexColors.PillText,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = JetBrainsMonoFamily,
        ),
    )
    val padH = 12.dp.toPx()
    val padV = 7.dp.toPx()
    val pillW = measured.size.width + padH * 2
    val pillH = measured.size.height + padV * 2
    val pillLeft = size.width - pillW - 6.dp.toPx()
    val pillTop = (lastY - pillH / 2).coerceIn(0f, size.height - pillH)

    drawLine(
        OddsdexColors.PillBackground,
        start = Offset(lastX, lastY),
        end = Offset(pillLeft, pillTop + pillH / 2),
        strokeWidth = 1.5f,
    )
    rotate(45f, pivot = Offset(lastX, lastY)) {
        drawRect(
            OddsdexColors.PillBackground,
            topLeft = Offset(lastX - 5f, lastY - 5f),
            size = Size(10f, 10f),
        )
    }
    val pillPath = Path().apply {
        addRoundRect(
            RoundRect(
                Rect(pillLeft, pillTop, pillLeft + pillW, pillTop + pillH),
                CornerRadius(pillH / 2),
            ),
        )
    }
    drawPath(pillPath, OddsdexColors.PillBackground)
    drawText(measured, topLeft = Offset(pillLeft + padH, pillTop + padV))
}
