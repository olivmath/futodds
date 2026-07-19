type QrCardProps = {
  /** "green" = solid green card (platform section), "dark" = footer variant */
  variant?: "green" | "dark";
};

/** Decorative QR-style pattern (deterministic, not a real code). */
function QrPattern() {
  // pseudo-random but deterministic fill so SSR/CSR match
  const cells: boolean[] = [];
  let seed = 42;
  for (let i = 0; i < 15 * 15; i++) {
    seed = (seed * 16807) % 2147483647;
    cells.push(seed % 100 < 46);
  }
  const finder = (x: number, y: number) => (
    <g key={`f${x}${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="#081310" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#ffffff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#081310" />
    </g>
  );
  return (
    <svg viewBox="0 0 15 15" className="h-full w-full" aria-hidden="true">
      <rect width={15} height={15} fill="#ffffff" />
      {cells.map((on, i) => {
        const x = i % 15;
        const y = Math.floor(i / 15);
        const inFinder =
          (x < 7 && y < 7) || (x > 7 && y < 7 && x >= 8) || (x < 7 && y >= 8);
        if (!on || inFinder) return null;
        return <rect key={i} x={x} y={y} width={1} height={1} fill="#081310" />;
      })}
      {finder(0, 0)}
      {finder(8, 0)}
      {finder(0, 8)}
    </svg>
  );
}

export default function QrCard({ variant = "green" }: QrCardProps) {
  const isGreen = variant === "green";
  return (
    <div
      className={`flex items-center gap-5 rounded-2xl p-4 pr-8 ${
        isGreen ? "bg-primary text-[#081310]" : "bg-surface/80 text-fg"
      }`}
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white p-1.5">
        <QrPattern />
      </div>
      <div>
        <p className="text-xl font-semibold leading-tight">
          Your financial future
          <br />
          is in your hands
        </p>
        <a
          href="#download"
          className={`mt-1.5 inline-block text-[15px] font-semibold ${
            isGreen ? "text-[#081310]/80 hover:text-[#081310]" : "text-primary hover:text-primary-soft"
          } transition-colors duration-200`}
        >
          Download the app now ›
        </a>
      </div>
    </div>
  );
}
