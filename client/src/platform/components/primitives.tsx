import React from "react";
import { X } from "@/platform/ui/icons";
import { trapTab } from "@/platform/ui/overlays";
import { FONT, GREEN } from "@/platform/constants";
import { STATUS } from "@/platform/utils/inventoryStatus";

export function Avatar({ name, size = 32, bg = GREEN }: { name: string; size?: number; bg?: string }) {
  const i = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 800,
        flexShrink: 0,
        fontFamily: FONT
      }}
    >
      {i}
    </div>
  );
}

export function Badge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 9px",
        borderRadius: 99,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: FONT
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}

export function BarChart({ data, color = GREEN, height = 48 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i === data.length - 1 ? color : `${color}50`,
            borderRadius: "3px 3px 0 0",
            height: `${(v / max) * 100}%`,
            minHeight: 3
          }}
        />
      ))}
    </div>
  );
}

export function BarChartSimple({ data, color, height = 48 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i === data.length - 1 ? color : `${color}50`,
            borderRadius: "3px 3px 0 0",
            height: `${(v / max) * 100}%`,
            minHeight: 3
          }}
        />
      ))}
    </div>
  );
}

export function Sparkline({
  data,
  color,
  h = 28,
  w = 60
}: {
  data: number[];
  color: string;
  h?: number;
  w?: number;
}) {
  const max = Math.max(...data),
    min = Math.min(...data),
    r = max - min || 1,
    p = 2;
  const pts = data
    .map((v, i) => {
      const x = p + (i / (data.length - 1)) * (w - p * 2),
        y = h - p - ((v - min) / r) * (h - p * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {data.map((v, i) => {
        const x = p + (i / (data.length - 1)) * (w - p * 2),
          y = h - p - ((v - min) / r) * (h - p * 2);
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 2.5 : 1.5} fill={color} opacity={i === data.length - 1 ? 1 : 0.4} />;
      })}
    </svg>
  );
}

export function StockBar({
  stock,
  reorderPoint,
  maxStock,
  status
}: {
  stock: number;
  reorderPoint: number;
  maxStock: number;
  status: keyof typeof STATUS;
}) {
  const pct = Math.min((stock / maxStock) * 100, 100),
    rp = (reorderPoint / maxStock) * 100;
  return (
    <div style={{ position: "relative", height: 5, background: "#f1f5f9", borderRadius: 99, overflow: "visible" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          width: `${pct}%`,
          background: STATUS[status].color,
          borderRadius: 99
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -3,
          height: 11,
          width: 2,
          background: "#94a3b8",
          borderRadius: 1,
          left: `${rp}%`,
          transform: "translateX(-50%)"
        }}
      />
    </div>
  );
}

/**
 * Legacy modal API used by screens that have not been redesigned yet, now on a
 * native <dialog>: focus is trapped, Esc closes, the page behind is inert, and
 * on phones it is a bottom sheet that can never be wider than the screen.
 */
export function Modal({
  open,
  onClose,
  children,
  maxW = 500,
  label = "Dialog"
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxW?: number;
  label?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      const el = returnTo.current;
      if (el && document.contains(el)) el.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="nv-dialog"
      aria-label={label}
      style={{ "--dialog-w": `${maxW}px` } as React.CSSProperties}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={trapTab}
    >
      {open && (
        <>
          <div className="nv-dialog__grabber" aria-hidden="true" />
          <button type="button" className="nv-icon-btn nv-legacy-modal__close" aria-label="Close" title="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
          <div className="nv-legacy-modal">{children}</div>
        </>
      )}
    </dialog>
  );
}

export { Toast } from "@/platform/ui/feedback";

/** Label + control. Wrapping in <label> associates the text with the control inside. */
export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className="nv-legacy-field" style={full ? { gridColumn: "1/-1" } : undefined}>
      <span className="nv-legacy-field__label">{label}</span>
      {children}
    </label>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  style = {}
}: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  type?: string;
  style?: React.CSSProperties;
}) {
  return <input className="nv-input" type={type} value={value} onChange={onChange} placeholder={placeholder} style={style} />;
}

export function SectionHead({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: GREEN,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: 10,
        marginTop: 6,
        paddingBottom: 6,
        borderBottom: "1px solid #f0fdf4"
      }}
    >
      {label}
    </div>
  );
}

