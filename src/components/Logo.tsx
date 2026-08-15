/**
 * The Crossover Studio mark: two filter flanks that meet at one point — a
 * blue curve above, a green one below, crossing dead centre. Drawn as inline
 * SVG (crisp at any size, ~1 kB, themable) after Sander's logo. The geometry
 * is deliberate: each curve starts on its own level, swings away, and passes
 * through the crossing at the midpoint between the two levels — the picture
 * of a low-pass and a high-pass handing over.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const h = Math.round((size * 48) / 120);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 120 48"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 14 C12 14 20 4 30 4 C40 4 50 24 60 24 C70 24 80 4 90 4 C100 4 108 14 116 14"
        stroke="var(--logo-blue, #1e6fe8)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 34 C12 34 20 44 30 44 C40 44 50 24 60 24 C70 24 80 44 90 44 C100 44 108 34 116 34"
        stroke="var(--logo-green, #2fc542)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark as in the logo: CROSS in the foreground colour, OVER in blue. */
export function LogoWord({ className }: { className?: string }) {
  return (
    <span className={className}>
      Cross<span className="logo-over">over</span> Studio
    </span>
  );
}
