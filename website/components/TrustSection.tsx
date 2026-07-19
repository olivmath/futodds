import Reveal from "./Reveal";

const TRUST_BADGES = [
  { short: "SOL", label: "Solana", detail: "On-chain program" },
  { short: "USD", label: "USDC", detail: "Native settlement" },
  { short: "SV", label: "Seed Vault", detail: "Keys on device" },
  { short: "OSS", label: "Open source", detail: "Auditable code" },
  { short: "DEV", label: "Devnet", detail: "Labeled demo" },
];

/** Big 3D-ish logo glyph over glowing green spheres, like the reference. */
function LogoSculpture() {
  return (
    <div className="relative mx-auto mt-12 flex h-[340px] max-w-3xl items-center justify-center sm:h-[440px]">
      {/* glow field */}
      <div
        className="absolute bottom-0 left-1/2 h-56 w-[80%] -translate-x-1/2 rounded-[50%] blur-3xl"
        style={{ background: "rgba(47,224,131,0.18)" }}
        aria-hidden="true"
      />
      {/* turf spheres */}
      <div className="absolute bottom-0 flex w-full items-end justify-center" aria-hidden="true">
        {[110, 150, 180, 150, 115].map((size, i) => (
          <div
            key={i}
            className="-mx-4 rounded-full"
            style={{
              width: size,
              height: size,
              background:
                "radial-gradient(circle at 35% 30%, #1d4d33, #0a1f15 70%)",
              boxShadow: "inset 0 -18px 40px rgba(47,224,131,0.25)",
            }}
          />
        ))}
      </div>
      {/* glyph */}
      <svg
        className="relative -mb-6 drop-shadow-[0_30px_60px_rgba(0,0,0,0.6)]"
        width="300"
        height="210"
        viewBox="0 0 300 210"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M30 175 L120 40 a18 18 0 0 1 30 0 l90 135"
          stroke="#242e29"
          strokeWidth="34"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M175 120 l38 48 a15 15 0 0 0 25 0 l32 -40"
          stroke="var(--primary)"
          strokeWidth="34"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M30 175 L120 40 a18 18 0 0 1 30 0 l90 135"
          stroke="#39463f"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function TrustSection() {
  return (
    <section id="about" className="overflow-hidden py-24">
      <Reveal>
        <h2 className="mx-auto max-w-3xl text-balance px-5 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          oddsdex is non-custodial:
          <br />
          your keys, your balance, on-chain
        </h2>
      </Reveal>

      <Reveal delay={100}>
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-6 px-5">
          {TRUST_BADGES.map((badge) => (
            <li key={badge.label} className="flex flex-col items-center gap-1.5">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-fg/25 text-[11px] font-bold uppercase tracking-wide text-fg/80">
                {badge.short}
              </span>
              <span className="text-xs text-fg-muted">{badge.label}</span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={160} className="text-center">
        <a
          href="#faq"
          className="mt-8 inline-block text-[15px] font-medium text-primary transition-colors duration-200 hover:text-primary-soft"
        >
          Learn more ›
        </a>
      </Reveal>

      <Reveal delay={200}>
        <LogoSculpture />
      </Reveal>
    </section>
  );
}
