type P = { size?: number; color?: string; strokeWidth?: number; className?: string };

const base = (size: number, color: string, sw: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: sw,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  className,
});

export function ChevronRight({ size = 18, color = "var(--c-muted)", strokeWidth = 2, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function ChevronLeft({ size = 22, color = "var(--c-ink)", strokeWidth = 2, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function Mic({ size = 22, color = "var(--c-on-saffron)", strokeWidth = 2, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}

export function Gear({ size = 22, color = "var(--c-ink)", strokeWidth = 1.8, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.4.9H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

export function Close({ size = 20, color = "var(--c-muted)", strokeWidth = 2, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function Search({ size = 18, color = "var(--c-muted)", strokeWidth = 2, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function Check({ size = 16, color = "var(--c-on-saffron)", strokeWidth = 3, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function CalendarIcon({ size = 22, color = "var(--c-muted)", strokeWidth = 1.8, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function GridIcon({ size = 22, color = "var(--c-muted)", strokeWidth = 1.8, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

export function MedalIcon({ size = 22, color = "var(--c-muted)", strokeWidth = 1.8, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <circle cx="12" cy="15" r="6" />
      <path d="M8.5 9.5L6 2h12l-2.5 7.5" />
    </svg>
  );
}

export function FlameIcon({ size = 22, color = "var(--c-muted)", strokeWidth = 1.8, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <path d="M12 3c2.5 3 1 5 3 7.5 1.4 1.8 2 3 2 4.5a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5.5C10.8 7.8 11 5.5 12 3z" />
    </svg>
  );
}

export function SunIcon({ size = 22, color = "var(--c-muted)", strokeWidth = 1.8, className }: P) {
  return (
    <svg {...base(size, color, strokeWidth, className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** 24-spoke Ashoka-chakra inspired mark. */
export function Chakra({ size = 22, color = "var(--c-saffron)", className }: { size?: number; color?: string; className?: string }) {
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
      className={className}
    >
      <circle cx="24" cy="24" r="21" fill="none" stroke={color} strokeWidth="2.5" />
      <circle cx="24" cy="24" r="3.5" fill={color} />
      {spokes.map((deg) => (
        <line
          key={deg}
          x1="24"
          y1="24"
          x2="24"
          y2="4"
          stroke={color}
          strokeWidth="1.1"
          transform={`rotate(${deg} 24 24)`}
        />
      ))}
    </svg>
  );
}
