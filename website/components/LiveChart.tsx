"use client";

import { useEffect, useRef } from "react";

type LiveChartProps = {
  className?: string;
  /** starting odd value */
  start?: number;
  /** show the price pill on the right edge */
  showPill?: boolean;
};

/**
 * Live odds line chart (canvas). Cyan by brand rule — the series must read
 * as data-neutral before settlement; green is reserved for reward moments.
 * Tick math: momentum + volatility clustering + mean reversion (port of the
 * app's SimulatedTickSource).
 */
export default function LiveChart({
  className = "",
  start = 2.31,
  showPill = true,
}: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CYAN = "#41d9e8";
    const WINDOW = 120; // points on screen
    const points: number[] = [];

    let value = start;
    let momentum = 0;
    let vol = 0.004;
    let raf = 0;
    let last = 0;

    for (let i = 0; i < WINDOW; i++) {
      tick();
    }

    function tick() {
      // volatility clustering
      vol = Math.min(0.012, Math.max(0.0015, vol + (Math.random() - 0.5) * 0.001));
      // momentum with decay + shock
      momentum = momentum * 0.92 + (Math.random() - 0.5) * vol;
      // mean reversion toward the start value
      const reversion = (start - value) * 0.004;
      value = Math.max(1.01, value + momentum + reversion);
      points.push(value);
      if (points.length > WINDOW) points.shift();
    }

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!canvas || !ctx) return;
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);

      const min = Math.min(...points);
      const max = Math.max(...points);
      const pad = (max - min) * 0.25 + 0.001;
      const y = (v: number) => h - ((v - (min - pad)) / (max - min + pad * 2)) * h;
      const x = (i: number) => (i / (WINDOW - 1)) * w;

      // area fill: cyan 22% → 2%
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(65,217,232,0.22)");
      grad.addColorStop(1, "rgba(65,217,232,0.02)");
      ctx.beginPath();
      points.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // line
      ctx.beginPath();
      points.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();

      // glowing head
      const headY = y(points[points.length - 1]);
      ctx.beginPath();
      ctx.arc(w - 1, headY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = CYAN;
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (pillRef.current) {
        pillRef.current.textContent = points[points.length - 1].toFixed(4);
        pillRef.current.style.top = `${Math.min(Math.max(headY - 12, 0), h - 24)}px`;
      }
    }

    function loop(t: number) {
      if (t - last > 90) {
        tick();
        last = t;
      }
      draw();
      raf = requestAnimationFrame(loop);
    }

    resize();
    draw(); // static first frame — never block LCP on animation
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!media.matches) raf = requestAnimationFrame(loop);

    const onResize = () => {
      resize();
      draw();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [start]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
      {showPill && (
        <span
          ref={pillRef}
          className="num absolute right-0 rounded-md bg-fg px-1.5 py-0.5 text-[10px] font-semibold text-[#081310]"
        >
          {start.toFixed(4)}
        </span>
      )}
    </div>
  );
}
