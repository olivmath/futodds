import LiveChart from "./LiveChart";
import QrCard from "./QrCard";
import Reveal from "./Reveal";

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[300px] rounded-[2.6rem] border-[10px] border-[#1a2620] bg-bg shadow-[0_40px_120px_-20px_rgba(0,229,201,0.15)] sm:w-[330px]">
      {/* notch */}
      <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-[#1a2620]" />

      <div className="px-4 pb-4 pt-9">
        {/* balance header */}
        <div className="flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-chip text-sm">
            ⚽
          </div>
          <div className="text-center">
            <p className="num text-[15px] font-semibold">USDC 100.00</p>
            <p className="text-[11px] text-fg-muted">Demo account ▾</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-[#081310]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M1 7h14" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </div>
        </div>

        {/* asset row */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-3 py-2">
          <p className="text-[12px] font-medium">FLA × PAL · Home odd</p>
          <p className="num text-[12px] text-fg-muted">60s</p>
        </div>

        {/* live chart */}
        <LiveChart className="mt-3 h-40" start={2.31} />

        {/* buy/sell panel */}
        <div className="mt-3 rounded-2xl bg-surface p-2.5">
          <div className="flex rounded-xl bg-chip p-1 text-center text-[13px] font-semibold">
            <span className="flex-1 rounded-lg bg-fg py-1.5 text-[#081310]">UP ↑</span>
            <span className="flex-1 py-1.5 text-fg-muted">DOWN ↓</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-chip px-3 py-2">
              <p className="text-[10px] text-fg-muted">Amount, USDC</p>
              <p className="num text-[14px] font-semibold">10</p>
            </div>
            <div className="rounded-xl bg-chip px-3 py-2">
              <p className="text-[10px] text-fg-muted">Window</p>
              <p className="num text-[14px] font-semibold">60s</p>
            </div>
          </div>
          <button
            type="button"
            className="cta-gradient mt-2 w-full rounded-xl py-2.5 text-[14px] font-bold text-[#081310]"
          >
            Confirm UP
            <span className="num block text-[10px] font-semibold opacity-80">
              Payout: 19.40 USDC
            </span>
          </button>
        </div>

        {/* tab bar */}
        <div className="mt-3 flex justify-between px-2 text-center text-[9px] text-fg-muted">
          {["Terminal", "Trades", "Matches", "Rewards", "Help"].map((tab, i) => (
            <span key={tab} className={i === 0 ? "text-fg" : undefined}>
              <span className="mb-0.5 block text-[13px]" aria-hidden="true">
                {["📈", "⇅", "⚽", "🏆", "❓"][i]}
              </span>
              {tab}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PhoneSection() {
  return (
    <section id="platform" className="relative overflow-hidden py-24">
      <Reveal>
        <h2 className="mx-auto max-w-3xl text-balance px-5 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          A modern trading platform
        </h2>
      </Reveal>

      <Reveal delay={120} className="mt-14 flex justify-center px-5">
        <PhoneMockup />
      </Reveal>

      <Reveal delay={200} className="mt-10 flex justify-center px-5">
        <QrCard variant="green" />
      </Reveal>
    </section>
  );
}
