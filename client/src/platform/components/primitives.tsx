import React from "react";
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

export function Modal({
  open,
  onClose,
  children,
  maxW = 500
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxW?: number;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,8,23,0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: 32,
          width: "100%",
          maxWidth: maxW,
          boxShadow: "0 32px 80px #00000030",
          maxHeight: "92vh",
          overflowY: "auto"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Toast({ toast }: { toast: { msg: string; type: "success" | "error" | "info" | "warning" } | null }) {
  if (!toast) return null;
  const c = { success: "#065f46", error: "#7f1d1d", info: "#1e3a5f", warning: "#78350f" } as const;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        background: c[toast.type] || c.success,
        color: "#fff",
        padding: "12px 22px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        zIndex: 300,
        whiteSpace: "nowrap",
        boxShadow: "0 8px 32px #00000030",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: FONT,
        animation: "slideUp 0.3s ease"
      }}
    >
      {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"} {toast.msg}
    </div>
  );
}

export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: "1/-1" } : {}}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#475569",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          display: "block",
          marginBottom: 5
        }}
      >
        {label}
      </label>
      {children}
    </div>
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
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "10px 12px",
        border: "1.5px solid #e2e8f0",
        borderRadius: 9,
        fontSize: 13,
        fontFamily: FONT,
        outline: "none",
        boxSizing: "border-box",
        ...style
      }}
    />
  );
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

