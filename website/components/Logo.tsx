type LogoProps = {
  className?: string;
};

/** oddsdex wordmark + up/down glyph */
export default function Logo({ className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-[22px] font-bold tracking-tight text-fg">
        oddsdex
      </span>
      <svg
        width="30"
        height="20"
        viewBox="0 0 30 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2 17 L10 5 a2.4 2.4 0 0 1 4 0 l8 12"
          stroke="var(--fg-base)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17 12 l4 5 a2 2 0 0 0 3.4 0 L28 13"
          stroke="var(--primary)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
