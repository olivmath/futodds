import Reveal from "./Reveal";

const STEPS = [
  {
    n: "01",
    title: "Deposit USDC into a match pool",
    body: "Every match has its own liquidity pool on Solana (one PDA per match). Your deposit mints LP shares proportional to the pool: first deposit is 1:1, after that shares = amount × total shares ÷ total liquidity.",
  },
  {
    n: "02",
    title: "The pool is the counterparty",
    body: "Traders' stakes are escrowed against pool liquidity. While bets are open, the backing portion shows as locked; exposure is capped so the pool can never over-commit.",
  },
  {
    n: "03",
    title: "Earn fees, withdraw anytime unlocked",
    body: "A 2% fee on winning trades accrues to the pool — 1.5% to LPs, 0.5% to the protocol. Withdraw your unlocked share and claim fees whenever you want.",
  },
];

const POOL_STATS = [
  { label: "Fee on winning trades", value: "2.00%" },
  { label: "LP / protocol split", value: "1.5 / 0.5" },
  { label: "Max pool exposure", value: "80%" },
  { label: "Settlement window", value: "60s" },
];

export default function InvestorSection() {
  return (
    <section id="investors" className="overflow-hidden py-24">
      <Reveal>
        <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          For investors
        </p>
        <h2 className="mx-auto mt-3 max-w-3xl text-balance px-5 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          Back the pools.
          <br />
          Earn the fees.
        </h2>
        <p className="mx-auto mt-5 max-w-xl px-5 text-center text-lg text-fg-muted">
          Liquidity providers fund the per-match pools that pay every winning
          trade — and collect the fees from all of them.
        </p>
      </Reveal>

      <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 px-5 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.n} delay={i * 90}>
            <div className="flex h-full flex-col rounded-[2rem] bg-surface p-8">
              <span className="num text-sm font-bold text-primary">{step.n}</span>
              <h3 className="mt-3 text-xl font-semibold leading-snug">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                {step.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={120} className="mx-auto mt-5 max-w-5xl px-5">
        <div className="grid grid-cols-2 gap-5 rounded-[2rem] bg-surface p-8 sm:grid-cols-4">
          {POOL_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="num text-3xl font-bold text-fg">{stat.value}</p>
              <p className="mt-1 text-xs text-fg-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={160} className="mt-10 text-center">
        <a
          href="/investors"
          className="cta-gradient inline-block rounded-2xl px-8 py-4 text-lg font-semibold text-[#081310] transition-transform duration-200 hover:scale-[1.04]"
        >
          Open the investor panel
        </a>
        <p className="mx-auto mt-4 max-w-md px-5 text-xs leading-relaxed text-fg-muted">
          LPs are the counterparty of every trade: returns are variable and can
          be negative when traders win. Liquidity backing open bets stays
          locked until settlement.
        </p>
      </Reveal>
    </section>
  );
}
