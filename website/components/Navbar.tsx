import Logo from "./Logo";

const NAV_LINKS = [
  { label: "Trading", href: "/#platform" },
  { label: "Investors", href: "/#investors" },
  { label: "Download app", href: "/#download" },
  { label: "About", href: "/#about" },
  { label: "Help", href: "/#faq" },
];

export default function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between gap-4 px-5 lg:px-10">
        <a href="/" aria-label="oddsdex — home" className="shrink-0">
          <Logo />
        </a>

        <nav
          aria-label="Main"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-2xl bg-surface/90 px-3 py-2.5 lg:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-xl px-4 py-1.5 text-[15px] text-fg/90 transition-colors duration-200 hover:bg-chip hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <span
            className="hidden h-7 w-7 items-center justify-center rounded-full text-lg sm:flex"
            title="English"
            aria-label="Language: English"
          >
            🌐
          </span>
          <a
            href="/investors"
            className="rounded-xl bg-chip px-5 py-2.5 text-[15px] font-medium text-fg transition-colors duration-200 hover:bg-surface"
          >
            Sign in
          </a>
          <a
            href="/#download"
            className="rounded-xl bg-primary px-5 py-2.5 text-[15px] font-semibold text-[#081310] transition-transform duration-200 hover:scale-[1.03]"
          >
            Try it free
          </a>
        </div>
      </div>
    </header>
  );
}
