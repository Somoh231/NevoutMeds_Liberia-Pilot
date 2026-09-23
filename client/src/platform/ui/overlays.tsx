import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from "react";
import { IconButton, cx } from "./controls";
import { X } from "./icons";

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside a modal. Native <dialog> makes the page inert, but at the
 * last control Chrome lets Tab leave the document for the browser UI; the
 * WAI-ARIA dialog pattern wraps back to the first control instead.
 */
export function trapTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Opens a native <dialog> as a modal. The browser then provides what used to
 * need a library: focus moves inside, the page behind becomes inert, Tab is
 * contained, and Esc closes. We add focus restoration and backdrop clicks.
 */
function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);
  useEffect(() => {
    if (open) return;
    // Put focus back where the user was, so keyboard users are not dumped at the top.
    const el = returnTo.current;
    returnTo.current = null;
    if (el && document.contains(el)) el.focus();
  }, [open]);
  const handlers = {
    onCancel: (e: React.SyntheticEvent) => {
      e.preventDefault();
      onClose();
    },
    onMouseDown: (e: React.MouseEvent) => {
      // A press that starts and lands on the dialog element itself is the backdrop.
      if (e.target === ref.current) onClose();
    },
    onKeyDown: trapTab
  };
  return { ref, handlers };
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
  hideTitle
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Keep the title for screen readers but do not show it (content brings its own heading). */
  hideTitle?: boolean;
}) {
  const { ref, handlers } = useModalDialog(open, onClose);
  const id = useId();
  return (
    <dialog
      ref={ref}
      className="nv-dialog"
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      style={{ "--dialog-w": `${width}px` } as CSSProperties}
      {...handlers}
    >
      {open && (
        <>
          <div className="nv-dialog__grabber" aria-hidden="true" />
          <div className="nv-dialog__head" style={hideTitle ? { paddingBottom: 0 } : undefined}>
            <div style={{ minWidth: 0 }}>
              <h2 id={`${id}-t`} className={hideTitle ? "nv-visually-hidden" : "nv-dialog__title"}>{title}</h2>
              {description && <p id={`${id}-d`} className="nv-dialog__desc">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} style={hideTitle ? { marginLeft: "auto" } : undefined}>
              <X size={20} aria-hidden="true" />
            </IconButton>
          </div>
          <div className="nv-dialog__body">{children}</div>
          {footer && <div className="nv-dialog__foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/** A sheet from an edge: bottom on phones (thumb reach), side on larger screens. */
export function Drawer({
  open,
  onClose,
  title,
  side = "bottom",
  children
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  side?: "bottom" | "right" | "left";
  children: ReactNode;
}) {
  const { ref, handlers } = useModalDialog(open, onClose);
  const id = useId();
  return (
    <dialog ref={ref} className={cx("nv-drawer", `nv-drawer--${side}`)} aria-labelledby={`${id}-t`} {...handlers}>
      {open && (
        <>
          {side === "bottom" && <div className="nv-dialog__grabber" aria-hidden="true" />}
          <div className="nv-dialog__head">
            <h2 id={`${id}-t`} className="nv-dialog__title">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </IconButton>
          </div>
          <div className="nv-dialog__body" style={{ paddingBottom: "calc(var(--nv-space-6) + var(--nv-safe-bottom))" }}>{children}</div>
        </>
      )}
    </dialog>
  );
}

/**
 * Menu button + menu (WAI-ARIA menu pattern): Enter/Space/ArrowDown opens and
 * focuses the first item, arrows move, Esc closes and returns focus, Tab and
 * outside clicks close.
 */
export function Dropdown({
  trigger,
  children,
  label,
  align = "right",
  className
}: {
  trigger: (props: { "aria-haspopup": "menu"; "aria-expanded": boolean; "aria-controls": string; onClick: () => void; onKeyDown: (e: KeyboardEvent) => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  label: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openAndFocus = (index: 0 | -1) => {
    setOpen(true);
    requestAnimationFrame(() => {
      const list = items();
      (index === 0 ? list[0] : list[list.length - 1])?.focus();
    });
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAndFocus(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAndFocus(-1);
    }
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrap} className={cx("nv-menu-anchor", className)}>
      {trigger({ "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": id, onClick: () => setOpen((v) => !v), onKeyDown: onTriggerKey, ref: btn })}
      {open && (
        <div ref={menu} id={id} role="menu" aria-label={label} className={cx("nv-menu", align === "left" && "nv-menu--left")} onKeyDown={onMenuKey}>
          {children(() => close())}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
  href
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  href?: string;
}) {
  const cls = cx("nv-menu__item", danger && "nv-menu__item--danger");
  if (href) {
    return (
      <a role="menuitem" tabIndex={-1} className={cls} href={href} onClick={onSelect}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={cls} onClick={onSelect}>
      {icon}
      {children}
    </button>
  );
}

/**
 * Supplementary text on hover or keyboard focus. Never the only place
 * information lives: touch users cannot hover.
 */
export function Tooltip({ content, children, side = "top" }: { content: string; children: ReactElement; side?: "top" | "right" }) {
  const id = useId();
  return (
    <span className="nv-tooltip-wrap">
      {cloneElement(children, { "aria-describedby": id })}
      <span role="tooltip" id={id} className={cx("nv-tooltip", side === "right" && "nv-tooltip--right")}>
        {content}
      </span>
    </span>
  );
}

/**
 * Tabs with roving focus (arrow keys move between tabs, Tab moves into the panel).
 * Renders only the tab list; the caller renders the active panel with
 * `tabPanelProps(value)`.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  block,
  idBase
}: {
  tabs: Array<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  block?: boolean;
  idBase: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    requestAnimationFrame(() => document.getElementById(`${idBase}-tab-${tabs[next].id}`)?.focus());
  };
  return (
    <div role="tablist" aria-label={label} className={cx("nv-tabs", block && "nv-tabs--block")} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${idBase}-tab-${t.id}`}
          type="button"
          role="tab"
          className="nv-tab"
          aria-selected={t.id === value}
          aria-controls={`${idBase}-panel`}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const tabPanelProps = (idBase: string, value: string) => ({
  id: `${idBase}-panel`,
  role: "tabpanel" as const,
  "aria-labelledby": `${idBase}-tab-${value}`,
  tabIndex: 0
});
