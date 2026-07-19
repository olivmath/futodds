const FEATURE_CHIPS = [
  { emoji: "🔥", label: "Modern platform" },
  { emoji: "⚽", label: "Live odds" },
  { emoji: "🏁", label: "Easy start" },
  { emoji: "📚", label: "Learning hub" },
  { emoji: "💸", label: "USDC settlement" },
  { emoji: "🛡️", label: "Non-custodial" },
];

/** Ascending rounded bar silhouettes, like the reference hero backdrop. */
const BARS = [
  { left: "1%", height: 30, top: 58 },
  { left: "9%", height: 44, top: 42 },
  { left: "18%", height: 58, top: 28 },
  { left: "27%", height: 70, top: 18 },
  { left: "62%", height: 74, top: 8 },
  { left: "72%", height: 84, top: 4 },
  { left: "82%", height: 92, top: 0 },
  { left: "91%", height: 70, top: 12 },
];

export default function Hero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden pt-[72px]">
      {/* backdrop bars */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {BARS.map((bar, i) => (
          <div
            key={i}
            className="anim-bar absolute w-[9vw] min-w-24 rounded-[2.2rem] bg-surface/55"
            style={{
              left: bar.left,
              top: `${bar.top}%`,
              height: `${bar.height}%`,
              animationDelay: `${120 + i * 90}ms`,
            }}
          />
        ))}
        {/* soft field-green glow at the base */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background:
              "linear-gradient(to top, rgba(0,229,201,0.07), transparent)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col items-center px-5 pb-10 text-center">
        <h1
          className="anim-rise max-w-4xl text-balance text-[44px] font-semibold leading-[1.05] tracking-tight sm:text-[64px] lg:text-[76px]"
          style={{ animationDelay: "80ms" }}
        >
          Trade live odds with&nbsp;confidence
        </h1>

        <p
          className="anim-rise mt-5 max-w-xl text-lg text-fg-muted"
          style={{ animationDelay: "180ms" }}
        >
          UP or DOWN on a live football odd. 60 seconds.
          Settled in USDC, on Solana.
        </p>

        <div className="anim-rise mt-8" style={{ animationDelay: "280ms" }}>
          <a
            href="#download"
            className="inline-block rounded-2xl bg-primary px-8 py-4 text-lg font-semibold text-[#081310] transition-transform duration-200 hover:scale-[1.04]"
          >
            Start now with <span className="num">$0</span>
          </a>
          <div className="mt-5">
            <a
              href="#platform"
              className="text-[15px] font-medium text-primary transition-colors duration-200 hover:text-primary-soft"
            >
              Learn more ›
            </a>
          </div>
        </div>

        <ul
          className="anim-fade mt-16 flex w-full flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "420ms" }}
        >
          {FEATURE_CHIPS.map((chip) => (
            <li
              key={chip.label}
              className="flex items-center gap-2 rounded-xl bg-chip/90 px-4 py-2.5 text-[15px] font-medium"
            >
              <span aria-hidden="true">{chip.emoji}</span>
              {chip.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
