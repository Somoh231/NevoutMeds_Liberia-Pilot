import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { cx } from "./controls";

type CardProps = HTMLAttributes<HTMLDivElement> & { flush?: boolean; as?: "div" | "section" | "article" };

/** Calm, flat-ish panel for operational content (depth 1). */
export function Card({ flush, as: Tag = "div", className, ...rest }: CardProps) {
  return <Tag className={cx("nv-card", flush && "nv-card--flush", className)} {...rest} />;
}

/** Raised panel for content that should read as a step above its neighbours (depth 2). */
export function ElevatedCard({ className, ...rest }: CardProps) {
  return <Card className={cx("nv-card--elevated", className)} {...rest} />;
}

/**
 * A single figure with its label. `value` is rendered with tabular numerals.
 * Pass `pending` while the figure is loading: it shows a skeleton, never a 0.
 */
export function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  pending,
  onClick
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "strong";
  pending?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <div className="nv-metric">
      <div className="nv-metric__label">
        {icon}
        {label}
      </div>
      {pending ? (
        <span className="nv-skeleton" style={{ height: 30, width: "60%" }} aria-label="Loading" role="status" />
      ) : (
        <div className="nv-metric__value">{value}</div>
      )}
      {sub && <div className="nv-metric__sub">{sub}</div>}
    </div>
  );
  const cls = cx("nv-card", tone === "strong" ? "nv-card--strong nv-on-strong" : "nv-card--elevated", onClick && "nv-card--interactive");
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const canTilt = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches &&
  !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A decision surface: the one component allowed a (very small) pointer tilt.
 * Touch devices and reduced-motion users never get the tilt.
 */
export function ActionCard({
  icon,
  title,
  body,
  trailing,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & { icon?: ReactNode; title: ReactNode; body?: ReactNode; trailing?: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "mouse" || !canTilt() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    // At most 2.5°: a hint of physicality, not a gimmick.
    ref.current.style.setProperty("--ry", `${(x * 5).toFixed(2)}deg`);
    ref.current.style.setProperty("--rx", `${(-y * 5).toFixed(2)}deg`);
  };
  const reset = () => {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };
  return (
    <button ref={ref} type="button" className={cx("nv-action-card", className)} onPointerMove={onMove} onPointerLeave={reset} onBlur={reset} {...rest}>
      {icon && <span className="nv-action-card__icon" aria-hidden="true">{icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="nv-action-card__title" style={{ display: "block" }}>{title}</span>
        {body && <span className="nv-action-card__body" style={{ display: "block", marginTop: 2 }}>{body}</span>}
      </span>
      {trailing}
    </button>
  );
}

/** The screen's one <h1>, with an optional description and actions. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="nv-page-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="nv-page-header__title">{title}</h1>
        {description && <p className="nv-page-header__desc">{description}</p>}
      </div>
      {actions && <div className="nv-page-header__actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, description, actions, level = 2 }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="nv-section-header">
      <div style={{ minWidth: 0 }}>
        <H className="nv-section-header__title">{title}</H>
        {description && <p className="nv-section-header__desc">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Search + chips + actions. Chips scroll inside themselves on phones; the page never does. */
export function FilterBar({ search, children, actions }: { search?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="nv-filterbar">
      {search && <div className="nv-filterbar__search">{search}</div>}
      {children && <div className="nv-chips" role="group" aria-label="Filters">{children}</div>}
      {actions}
    </div>
  );
}

export function Chip({ pressed, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return <button type="button" className={cx("nv-chip", className)} aria-pressed={!!pressed} {...rest} />;
}
