import { useId } from "react";

/**
 * Vector rendering of the official capsule mark (two rounded bars) for small
 * sizes on light surfaces, where the photographic PNG in /public/brand reads
 * as a dark rectangle. Replace with the brand team's SVG when one exists.
 */
export function BrandMark({ size = 28, onDark }: { size?: number; onDark?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={onDark ? "#bbf7d0" : "#34d399"} />
          <stop offset="1" stopColor={onDark ? "#4ade80" : "#0b6b50"} />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={onDark ? "#4ade80" : "#10b981"} />
          <stop offset="1" stopColor={onDark ? "#16a34a" : "#064a37"} />
        </linearGradient>
      </defs>
      <rect x="6.5" y="4" width="8.5" height="24" rx="4.25" fill={`url(#${id}a)`} transform="skewX(-9) translate(4 0)" />
      <rect x="17" y="4" width="8.5" height="24" rx="4.25" fill={`url(#${id}b)`} transform="skewX(-9) translate(4 0)" />
    </svg>
  );
}

export function BrandLockup({ size = 28, onDark }: { size?: number; onDark?: boolean }) {
  return (
    <span className="nv-brand">
      <BrandMark size={size} onDark={onDark} />
      <span className="nv-brand__name">
        NevOut<span style={{ fontWeight: 450 }}> Meds</span>
      </span>
    </span>
  );
}
