import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import { CircleAlert, Eye, EyeOff, Search } from "./icons";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

// ── Button ────────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "on-strong";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  /** Shows a spinner, keeps the width, and blocks repeat submits. */
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", block, loading, icon, className, children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "nv-btn",
        variant !== "secondary" && `nv-btn--${variant}`,
        size !== "md" && `nv-btn--${size}`,
        block && "nv-btn--block",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="nv-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: an icon-only control must have an accessible name. */
  label: string;
  outline?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, outline, className, children, type = "button", ...rest },
  ref
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={cx("nv-icon-btn", outline && "nv-icon-btn--outline", className)} {...rest}>
      {children}
    </button>
  );
});

// ── FormField: label + hint + error, wired to the control by id ──────────
type FieldCtx = { id: string; describedBy?: string; invalid: boolean; required?: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

export function FormField({
  label,
  hint,
  error,
  required,
  children,
  className
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error, required }}>
      <div className={cx("nv-field", className)}>
        <label className="nv-label" htmlFor={id}>
          {label}
          {required && <span className="nv-req" aria-hidden="true">*</span>}
        </label>
        {children}
        {hint && !error && <div id={hintId} className="nv-hint">{hint}</div>}
        {error && (
          <div id={errorId} className="nv-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/** Props a control inherits from its surrounding FormField. */
function useFieldProps(props: { id?: string; "aria-describedby"?: string; "aria-invalid"?: unknown; required?: boolean }) {
  const f = useContext(FieldContext);
  if (!f) return {};
  return {
    id: props.id ?? f.id,
    "aria-describedby": props["aria-describedby"] ?? f.describedBy,
    "aria-invalid": (props["aria-invalid"] as boolean | undefined) ?? (f.invalid || undefined),
    required: props.required ?? f.required
  };
}

// ── Inputs ────────────────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  const field = useFieldProps(rest);
  return <input ref={ref} className={cx("nv-input", className)} {...rest} {...field} />;
});

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string }>(function SearchInput(
  { label, className, ...rest },
  ref
) {
  return (
    <div className={cx("nv-input-wrap", className)} role="search">
      <Search size={18} aria-hidden="true" />
      <input ref={ref} type="search" aria-label={label} className="nv-input" {...rest} />
    </div>
  );
});

/** Password with a show/hide toggle; the toggle is a real, labelled button. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(
  { className, ...rest },
  ref
) {
  const [shown, setShown] = useState(false);
  const field = useFieldProps(rest);
  return (
    <div className="nv-input-wrap">
      <input ref={ref} type={shown ? "text" : "password"} className={cx("nv-input nv-input--with-action", className)} {...rest} {...field} />
      <IconButton
        className="nv-input-action"
        label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
      >
        {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </IconButton>
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  const field = useFieldProps(rest);
  return (
    <select ref={ref} className={cx("nv-select", className)} {...rest} {...field}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  const field = useFieldProps(rest);
  return <textarea ref={ref} className={cx("nv-textarea", className)} {...rest} {...field} />;
});

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx("nv-check", className)}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="nv-switch-row">
      <div>
        <div id={`${id}-l`} style={{ fontWeight: 600 }}>{label}</div>
        {description && <div id={`${id}-d`} className="nv-hint">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        className="nv-switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export { cx };
