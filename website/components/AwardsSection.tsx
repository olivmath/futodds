import Reveal from "./Reveal";

const TESTIMONIALS = [
  {
    initial: "M",
    color: "#7c4ddb",
    name: "Marcus V.",
    title: "Simple to learn.",
    body: "I opened the demo account, picked a match, and within a minute I understood the UP/DOWN mechanic. The learning curve is close to zero.",
  },
  {
    initial: "J",
    color: "#d9822b",
    name: "Julia R.",
    title: "Real settlement.",
    body: "What convinced me was watching the result settle on-chain by itself, with no one approving my withdrawal. A completely different feeling of control.",
  },
  {
    initial: "P",
    color: "#2b8fd9",
    name: "Peter A.",
    title: "Built for football fans.",
    body: "Watching the odd move during the match is addictive in the best way: you trade the game you are already watching.",
  },
];

const MILESTONES = [
  { year: "2026", label: "World Cup Hackathon — Superteam × TxODDS" },
  { year: "2026", label: "On-chain program on devnet" },
  { year: "2026", label: "Native app for Solana Seeker" },
];

function TestimonialCarousel() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-surface p-8">
      <div className="snap-row flex flex-1 gap-6 overflow-x-auto">
        {TESTIMONIALS.map((t) => (
          <figure
            key={t.name}
            className="flex w-full shrink-0 flex-col items-center justify-center px-2 text-center"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
              style={{ backgroundColor: t.color }}
              aria-hidden="true"
            >
              {t.initial}
            </span>
            <figcaption className="mt-2 text-sm text-fg-muted">{t.name}</figcaption>
            <blockquote className="mt-8">
              <p className="text-xl font-semibold">{t.title}</p>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-fg-muted">
                {t.body}
              </p>
            </blockquote>
          </figure>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
        {TESTIMONIALS.map((t, i) => (
          <span
            key={t.name}
            className={`h-1.5 rounded-full ${i === 0 ? "w-8 bg-fg" : "w-1.5 bg-chip"}`}
          />
        ))}
      </div>
    </div>
  );
}

function MilestonesCard() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-surface p-8">
      <h3 className="text-center text-2xl font-semibold">
        Built at the World Cup Hackathon
      </h3>
      {/* big glowing number */}
      <div className="relative flex flex-1 items-center justify-center py-10">
        <div
          className="absolute h-40 w-40 rounded-full blur-3xl"
          style={{ background: "rgba(47,224,131,0.22)" }}
          aria-hidden="true"
        />
        <span className="num relative text-[120px] font-bold leading-none text-fg drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
          60<span className="align-top text-4xl">s</span>
        </span>
      </div>
      <ul className="flex items-start justify-between gap-3 text-center">
        {MILESTONES.map((m, i) => (
          <li key={m.label} className="flex-1">
            <span
              className={`num inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                i === 1 ? "bg-fg text-[#081310]" : "bg-chip text-fg-muted"
              }`}
            >
              {m.year}
            </span>
            <p className="mt-2 text-[11px] leading-snug text-fg-muted">{m.label}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SEO_COLUMNS = [
  {
    title: "Become an odds trader with oddsdex",
    body: "oddsdex turns the football odds market into a fixed-time trading instrument: pick a match, decide whether the odd goes up or down, and see the result in 60 seconds — settled transparently in USDC.",
  },
  {
    title: "A trustworthy platform is essential",
    body: "Trading involves risk — that is why oddsdex is non-custodial: keys stay on your device, the escrow lives in an auditable Solana program, and no result depends on manual approval. The demo account is always labeled as a simulation.",
  },
  {
    title: "Learn on demo before risking anything",
    body: "Start with 10,000 simulated USDC, learn how the odd reacts to the live match, and only then decide to trade for real. We never promise profits: the rule is to risk only the amount you chose at entry.",
  },
];

export default function AwardsSection() {
  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 px-5 md:grid-cols-2">
        <Reveal>
          <TestimonialCarousel />
        </Reveal>
        <Reveal delay={100}>
          <MilestonesCard />
        </Reveal>
      </div>

      {/* giant gradient CTA */}
      <Reveal className="mx-auto mt-6 max-w-4xl px-5">
        <a
          href="#download"
          className="cta-gradient block rounded-[3rem] py-14 text-center text-4xl font-semibold tracking-tight text-[#081310] transition-transform duration-300 hover:scale-[1.015] sm:text-5xl"
        >
          Start trading with confidence
        </a>
      </Reveal>

      <div className="mx-auto mt-24 grid max-w-5xl grid-cols-1 gap-10 px-5 md:grid-cols-3">
        {SEO_COLUMNS.map((col, i) => (
          <Reveal key={col.title} delay={i * 80}>
            <h3 className="text-lg font-semibold leading-snug">{col.title}</h3>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">{col.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
