import type { CSSProperties, ReactNode } from "react";
import type { Tone } from "@/platform/design/tokens";
import { cx } from "./controls";
import { CircleAlert, CircleCheck, Info, TriangleAlert, WifiOff, RefreshCw, type LucideIcon } from "./icons";

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("nv-badge", `nv-tone-${tone}`, className)}>{children}</span>;
}

/** A badge with a status dot. The text always carries the meaning; colour only reinforces it. */
export function StatusBadge({ tone = "neutral", live, children }: { tone?: Tone; live?: boolean; children: ReactNode }) {
  return (
    <span className={cx("nv-badge", `nv-tone-${tone}`)}>
      <span className={cx("nv-dot", live && "nv-dot--live")} aria-hidden="true" />
      {children}
    </span>
  );
}

const ALERT_ICON: Partial<Record<Tone, LucideIcon>> = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  info: Info,
  offline: WifiOff,
  pending: RefreshCw,
  conflict: TriangleAlert,
  brand: Info,
  neutral: Info
};

/**
 * Inline message. Errors and warnings are announced (role="alert"); the rest
 * politely (role="status").
 */
export function Alert({ tone = "info", title, children, actions, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  const Icon = ALERT_ICON[tone] ?? Info;
  const urgent = tone === "danger" || tone === "warning" || tone === "conflict";
  return (
    <div className={cx("nv-alert", `nv-tone-${tone}`, className)} role={urgent ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div style={{ minWidth: 0, flex: 1 }}>
        {title && <div className="nv-alert__title">{title}</div>}
        {children && <div className="nv-alert__body">{children}</div>}
        {actions && <div className="nv-alert__actions">{actions}</div>}
      </div>
    </div>
  );
}

export type ToastMessage = { msg: string; type: "success" | "error" | "info" | "warning" } | null;
const TOAST_ACCENT = { success: "#6ee7a8", error: "#fca5a5", info: "#93c5fd", warning: "#fcd34d" } as const;
const TOAST_ICON = { success: CircleCheck, error: CircleAlert, info: Info, warning: TriangleAlert } as const;

/** One transient message, announced politely (errors assertively). */
export function Toast({ toast }: { toast: ToastMessage }) {
  if (!toast) return <div className="nv-toasts" aria-live="polite" />;
  const Icon = TOAST_ICON[toast.type] ?? Info;
  return (
    <div className="nv-toasts" aria-live={toast.type === "error" ? "assertive" : "polite"}>
      <div className="nv-toast" role={toast.type === "error" ? "alert" : "status"} style={{ "--toast-accent": TOAST_ACCENT[toast.type] } as CSSProperties}>
        <Icon size={18} aria-hidden="true" />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

export function Skeleton({ width = "100%", height = 16, radius, style }: { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties }) {
  return <span className="nv-skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** A labelled loading block: screen readers hear the label, sighted users see the shape of what is coming. */
export function SkeletonBlock({ label = "Loading", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-label={label} style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={14} width={`${92 - i * 14}%`} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, actions, tone }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; tone?: Tone }) {
  return (
    <div className={cx("nv-state", tone && `nv-tone-${tone}`)}>
      {icon && <div className="nv-state__icon" aria-hidden="true">{icon}</div>}
      <h3 className="nv-state__title">{title}</h3>
      {children && <p className="nv-state__body">{children}</p>}
      {actions && <div className="nv-state__actions">{actions}</div>}
    </div>
  );
}

/** Something failed to load. Says what, and offers the one useful next step. */
export function ErrorState({ title = "Something went wrong", children, onRetry, retryLabel = "Try again" }: { title?: ReactNode; children?: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert">
      <EmptyState
        tone="danger"
        icon={<CircleAlert size={26} />}
        title={title}
        actions={
          onRetry && (
            <button type="button" className="nv-btn" onClick={onRetry}>
              <RefreshCw size={16} aria-hidden="true" />
              {retryLabel}
            </button>
          )
        }
      >
        {children}
      </EmptyState>
    </div>
  );
}
