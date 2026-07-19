import Logo from "./Logo";
import QrCard from "./QrCard";

const SOCIALS = [
  {
    label: "X (Twitter)",
    href: "#",
    icon: (
      <path d="M4 4l7.2 9.3L4.4 20h2.3l5.6-5.4 4.2 5.4H20l-7.5-9.7L18.9 4h-2.3l-5 4.9L7.7 4H4z" />
    ),
  },
  {
    label: "Instagram",
    href: "#",
    icon: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="5" fill="none" strokeWidth="2" stroke="currentColor" />
        <circle cx="12" cy="12" r="3.6" fill="none" strokeWidth="2" stroke="currentColor" />
        <circle cx="17" cy="7" r="1.2" />
      </>
    ),
  },
  {
    label: "Telegram",
    href: "#",
    icon: (
      <path d="M20.5 4.5L3.8 11c-.9.35-.85 1.65.08 1.92l4.1 1.2 1.55 4.8c.28.85 1.35 1 1.9.3l2.2-2.8 4.25 3.1c.7.5 1.7.13 1.87-.72l2.2-12.4c.18-1-.75-1.8-1.65-1.4zM9.5 13.6l8.4-6.4-6.6 7.1-.25 3-1.55-3.7z" />
    ),
  },
  {
    label: "YouTube",
    href: "#",
    icon: (
      <path d="M21.4 7.2a2.5 2.5 0 0 0-1.75-1.77C18.1 5 12 5 12 5s-6.1 0-7.65.43A2.5 2.5 0 0 0 2.6 7.2 26 26 0 0 0 2.2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.75 1.77C5.9 19 12 19 12 19s6.1 0 7.65-.43a2.5 2.5 0 0 0 1.75-1.77 26 26 0 0 0 .4-4.8 26 26 0 0 0-.4-4.8zM10 15.2V8.8l5.3 3.2-5.3 3.2z" />
    ),
  },
];

const LINK_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Platform", href: "/#platform" },
      { label: "Demo account", href: "/#platform" },
      { label: "Download for Seeker", href: "/#download" },
      { label: "Live matches", href: "/#platform" },
    ],
  },
  {
    title: "Investors",
    links: [
      { label: "How pools work", href: "/#investors" },
      { label: "Investor panel", href: "/investors" },
      { label: "On-chain program", href: "/#about" },
      { label: "Architecture", href: "/#about" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "FAQ", href: "/#faq" },
      { label: "Fees", href: "/#faq" },
      { label: "Devnet × Mainnet", href: "/#faq" },
      { label: "Contact", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer id="download" className="border-t border-surface pb-12 pt-20">
      <div className="mx-auto max-w-[1200px] px-5">
        <div className="grid gap-12 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:gap-16">
            <div>
              <p className="text-lg font-semibold leading-snug">
                Follow us on
                <br />
                social media
              </p>
              <ul className="mt-5 flex gap-3">
                {SOCIALS.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      aria-label={social.label}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-fg/30 text-fg transition-colors duration-200 hover:border-primary hover:text-primary"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        {social.icon}
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <nav className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Footer">
              {LINK_COLUMNS.map((col) => (
                <div key={col.title}>
                  <p className="text-sm font-semibold text-fg">{col.title}</p>
                  <ul className="mt-3 space-y-2">
                    {col.links.map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className="text-sm text-fg-muted transition-colors duration-200 hover:text-fg"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <QrCard variant="dark" />
        </div>

        <div className="mt-16 border-t border-surface pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Logo />
            <p className="text-xs text-fg-muted">
              © 2026 oddsdex · World Cup Hackathon — Superteam × TxODDS
            </p>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-fg-muted">
            Risk warning: trading fixed-time odds involves a real risk of
            losing your stake, and providing pool liquidity involves a real
            risk of loss when traders win. oddsdex never promises profits. The
            demo account is a simulation with fictional balance and is labeled
            as such across the product. Only trade or invest amounts you can
            afford to lose.
          </p>
        </div>
      </div>
    </footer>
  );
}
