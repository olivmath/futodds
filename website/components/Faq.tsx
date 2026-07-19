import Reveal from "./Reveal";

const FAQS = [
  {
    q: "What is an odd, and what am I trading?",
    a: "The odd is the live price of a football outcome (via the TxODDS feed). On oddsdex you are not betting on the match itself: you predict whether that odd will be higher (UP) or lower (DOWN) 60 seconds from now.",
  },
  {
    q: "What happens if the odd ends exactly flat?",
    a: "If the settlement price ties exactly with the entry price, your stake is returned in full to your wallet — no fee is charged on the refunded amount.",
  },
  {
    q: "What are the fees?",
    a: "The platform fee applies only to winning trades and feeds the liquidity pool that backs every position. Solana network costs are fractions of a cent.",
  },
  {
    q: "Demo vs. mainnet: what is the difference?",
    a: "The demo account runs on simulated balance and is always labeled as a simulation. The real version settles in USDC on Solana. While the program runs on devnet, that is clearly indicated in the app.",
  },
  {
    q: "Who holds my money?",
    a: "No one but you. oddsdex is non-custodial: keys stay in your device's Seed Vault, and the amount at stake sits in escrow inside a Solana program until automatic settlement.",
  },
  {
    q: "How do investors (LPs) earn?",
    a: "Liquidity providers deposit USDC into a match pool and receive LP shares. The pool is the counterparty of every trade: it collects losing stakes and the fee charged on winning trades, and it pays out winners. LP returns are variable and can be negative — see the Investors section.",
  },
];

export default function Faq() {
  return (
    <section id="faq" className="py-24">
      <Reveal>
        <h2 className="mx-auto max-w-3xl px-5 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          Frequently asked questions
        </h2>
      </Reveal>
      <div className="mx-auto mt-12 max-w-3xl space-y-3 px-5">
        {FAQS.map((faq, i) => (
          <Reveal key={faq.q} delay={i * 60}>
            <details className="group rounded-2xl bg-surface px-6 py-5 open:bg-chip">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span
                  className="text-primary transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                {faq.a}
              </p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
