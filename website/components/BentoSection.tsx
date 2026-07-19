import LiveChart from "./LiveChart";
import Reveal from "./Reveal";

function DemoAccountCard() {
  return (
    <Reveal className="col-span-full">
      <div className="grid overflow-hidden rounded-[2rem] bg-surface md:grid-cols-2">
        <div className="flex flex-col items-center justify-center gap-5 px-8 py-14 text-center">
          <h3 className="text-3xl font-semibold leading-tight">
            Demo account
            <span className="block text-fg-muted">designed for practice</span>
          </h3>
          <a
            href="#download"
            className="rounded-2xl bg-primary px-7 py-3.5 font-semibold text-[#081310] transition-transform duration-200 hover:scale-[1.04]"
          >
            Try it now
          </a>
          <a
            href="#faq"
            className="text-[15px] font-medium text-primary transition-colors duration-200 hover:text-primary-soft"
          >
            Learn more ›
          </a>
        </div>

        {/* account picker mock */}
        <div className="relative flex items-center justify-center px-8 pb-12 md:pb-0">
          <div className="w-72 space-y-2 rounded-2xl bg-bg/70 p-3 backdrop-blur">
            {[
              { name: "Live account", amount: "— USDC", active: false },
              { name: "Demo account", amount: "10,000.00 USDC", active: true },
              { name: "USDC · Solana", amount: "", active: false },
              { name: "Devnet", amount: "", active: false },
            ].map((acc) => (
              <div
                key={acc.name}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] ${
                  acc.active
                    ? "bg-chip font-semibold text-fg"
                    : "text-fg-muted"
                }`}
              >
                <span>{acc.name}</span>
                <span className="num text-[12px]">{acc.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function RiskFreeCard() {
  return (
    <Reveal>
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-surface">
        <div className="px-8 pt-10 text-center">
          <h3 className="text-2xl font-semibold leading-snug">
            Demo trades{" "}
            <span className="text-fg-muted">
              let you practice with confidence
            </span>
          </h3>
          <a
            href="#faq"
            className="mt-3 inline-block text-[15px] font-medium text-primary transition-colors duration-200 hover:text-primary-soft"
          >
            Learn more ›
          </a>
        </div>
        {/* mini phone with chart + win pill */}
        <div className="relative mx-auto mt-8 w-56 rounded-t-[1.8rem] border-x-8 border-t-8 border-[#1a2620] bg-bg px-3 pt-5">
          <p className="num text-center text-[13px] font-semibold">
            10,000.00
          </p>
          <p className="text-center text-[10px] text-fg-muted">Demo account ▾</p>
          <div className="relative mt-2 h-28">
            <LiveChart className="h-full" start={1.87} showPill={false} />
            <span className="num absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-[#081310]">
              ✓ +$10.00
            </span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function InsuredCard() {
  return (
    <Reveal delay={80}>
      <div className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-surface">
        <div className="px-8 pt-10 text-center">
          <h3 className="text-2xl font-semibold">Custody stays with you</h3>
          <a
            href="#about"
            className="mt-3 inline-block text-[15px] font-medium text-primary transition-colors duration-200 hover:text-primary-soft"
          >
            Learn more ›
          </a>
        </div>
        {/* shield + check visual */}
        <div className="flex flex-1 items-end justify-center pb-8 pt-6">
          <svg width="180" height="120" viewBox="0 0 180 120" fill="none" aria-hidden="true">
            <path
              d="M90 8 L150 30 v34 c0 26 -28 42 -60 50 C58 106 30 90 30 64 V30 Z"
              fill="#14261f"
              stroke="#2a3a32"
              strokeWidth="3"
            />
            <path
              d="M66 60 l16 16 32 -34"
              stroke="var(--primary)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </Reveal>
  );
}

function NegativeBalanceCard() {
  return (
    <Reveal>
      <div className="flex h-full flex-col justify-between overflow-hidden rounded-[2rem] bg-surface px-8 py-10 text-center">
        <h3 className="text-2xl font-semibold leading-snug">
          Risk capped at your stake{" "}
          <span className="mx-1 inline-block h-6 w-11 rounded-full bg-primary p-1 align-middle">
            <span className="block h-4 w-4 translate-x-5 rounded-full bg-[#081310]" />
          </span>{" "}
          <span className="text-fg-muted">
            you never lose more than you chose to risk
          </span>
        </h3>
      </div>
    </Reveal>
  );
}

function StopLossCard() {
  return (
    <Reveal delay={80}>
      <div className="flex h-full flex-col justify-between overflow-hidden rounded-[2rem] bg-surface px-8 py-10 text-center">
        <h3 className="text-2xl font-semibold leading-snug">
          Automatic settlement{" "}
          <span className="text-fg-muted">
            closes the trade on its own at{" "}
            <span className="num">60s</span> — straight from the contract
          </span>
        </h3>
      </div>
    </Reveal>
  );
}

export default function BentoSection() {
  return (
    <section className="py-24">
      <Reveal>
        <h2 className="mx-auto max-w-3xl text-balance px-5 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          Explore trading
          <br />
          with risk-free instruments
        </h2>
      </Reveal>

      <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-5 px-5 md:grid-cols-2">
        <DemoAccountCard />
        <RiskFreeCard />
        <InsuredCard />
        <NegativeBalanceCard />
        <StopLossCard />
      </div>
    </section>
  );
}
