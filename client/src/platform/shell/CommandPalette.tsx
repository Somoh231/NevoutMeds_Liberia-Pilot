import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BellRing, CalendarClock, Package, Plus, Search, ShoppingCart, Truck, Users, type LucideIcon } from "@/platform/ui/icons";
import { navFor, type ScreenId } from "./navigation";

/**
 * Find anything, go anywhere: medicines, customers and the everyday actions.
 *
 * Deliberately small (no fuzzy-search library): it searches the lists this
 * device already holds, so it works offline and costs no network. Keyboard:
 * Ctrl/⌘K or "/" opens it, arrows move, Enter goes, Esc closes. Pattern
 * researched on 21st.dev (command palettes by ddoemonn, rafa-porto,
 * ephraimduncan): grouped results, an always-visible query, and actions
 * listed before search starts.
 */
export type CommandTarget = { screen: ScreenId | "import"; params?: Record<string, unknown>; href?: string };
type Product = { id: string | number; name: string; stock?: number; unit?: string; category?: string };
type Customer = { id: string | number; firstName?: string; lastName?: string; phone?: string };
type Item = { id: string; group: "Actions" | "Go to" | "Medicines" | "Customers"; label: string; hint?: string; icon: LucideIcon; target: CommandTarget; keywords?: string };

const ACTIONS: Array<Omit<Item, "group" | "id">> = [
  { label: "New sale", hint: "Record a sale at the counter", icon: ShoppingCart, target: { screen: "sales" }, keywords: "sell till checkout" },
  { label: "Add customer", hint: "Register a new customer", icon: Plus, target: { screen: "customers", params: { register: true } }, keywords: "register patient new" },
  { label: "Adjust stock", hint: "Delivery, damage or count correction", icon: Package, target: { screen: "inventory" }, keywords: "delivery received count inventory" },
  { label: "Compare supplier prices", hint: "Find the best recorded price", icon: Truck, target: { screen: "suppliers" }, keywords: "price compare cheaper buy" },
  { label: "Create an order", hint: "Order from a supplier", icon: Truck, target: { screen: "suppliers" }, keywords: "purchase order reorder" },
  { label: "New refill reminder", hint: "Bring a regular patient back", icon: BellRing, target: { screen: "reminders" }, keywords: "refill remind" },
  { label: "Check expiry", hint: "What expires soon", icon: CalendarClock, target: { screen: "expiry" }, keywords: "expired expiring" }
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export default function CommandPalette({
  open,
  onClose,
  onGo,
  role,
  products,
  customers,
  online
}: {
  open: boolean;
  onClose: () => void;
  onGo: (t: CommandTarget) => void;
  role?: string;
  products: Product[];
  customers: Customer[];
  online: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      setActive(0);
      d.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const query = norm(q);
    const nav: Item[] = navFor(role)
      .flatMap((g) => g.items)
      .map((i) => ({ id: `nav-${i.id}`, group: "Go to" as const, label: i.label, hint: i.description, icon: i.icon, target: { screen: i.id as ScreenId | "import", href: i.href } }));
    const actions: Item[] = ACTIONS.map((a, i) => ({ ...a, id: `act-${i}`, group: "Actions" as const }));
    if (!query) return [...actions, ...nav];
    const has = (s?: string) => !!s && norm(s).includes(query);
    const meds: Item[] = products
      .filter((p) => has(p.name) || has(p.category))
      .slice(0, 6)
      .map((p) => ({
        id: `med-${p.id}`, group: "Medicines", label: p.name, icon: Package,
        hint: p.stock == null ? p.category : `${p.stock} ${p.unit ?? "in stock"}${p.category ? ` · ${p.category}` : ""}`,
        target: { screen: "inventory", params: { query: p.name } }
      }));
    const digits = query.replace(/\D/g, "");
    const people: Item[] = customers
      .filter((c) => has(`${c.firstName ?? ""} ${c.lastName ?? ""}`) || (digits.length >= 3 && String(c.phone ?? "").replace(/\D/g, "").includes(digits)))
      .slice(0, 5)
      .map((c) => ({
        id: `cus-${c.id}`, group: "Customers", label: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(), hint: c.phone, icon: Users,
        target: { screen: "customers", params: { query: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() } }
      }));
    // Descriptions only count from three letters, so "am" doesn't match "Team".
    const acts = [...actions, ...nav].filter((a) => has(a.label) || has(a.keywords) || (query.length >= 3 && has(a.hint)));
    return [...meds, ...people, ...acts];
  }, [q, role, products, customers]);

  useEffect(() => setActive(0), [q]);
  const go = (i?: Item) => {
    if (!i) return;
    onClose();
    onGo(i.target);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
  };
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  let lastGroup = "";
  return (
    <dialog
      ref={ref}
      className="nv-cmd"
      aria-label="Search medicines, customers and actions"
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="nv-cmd__panel">
        <div className="nv-cmd__field">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className="nv-cmd__input"
            role="combobox"
            aria-label="Search medicines, customers and actions"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="Search medicines, customers or actions"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="nv-kbd" aria-hidden="true">Esc</kbd>
        </div>
        {!online && <p className="nv-cmd__note">Offline: searching what this device has saved.</p>}
        <ul id={listId} role="listbox" aria-label="Results" className="nv-cmd__list">
          {items.map((i, idx) => {
            const head = i.group !== lastGroup ? i.group : null;
            lastGroup = i.group;
            const Icon = i.icon;
            return (
              <li key={i.id} role="presentation">
                {head && <div className="nv-cmd__group" aria-hidden="true">{head}</div>}
                <div
                  id={`${listId}-${idx}`}
                  role="option"
                  aria-selected={idx === active}
                  className="nv-cmd__item"
                  onMouseMove={() => setActive(idx)}
                  onClick={() => go(i)}
                >
                  <span className="nv-cmd__icon" aria-hidden="true"><Icon size={17} /></span>
                  <span className="nv-cmd__text">
                    <span className="nv-cmd__label">{i.label}</span>
                    {i.hint && <span className="nv-cmd__hint">{i.hint}</span>}
                  </span>
                  <span className="nv-visually-hidden">{i.group}</span>
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="nv-cmd__empty" role="presentation">
              Nothing matches “{q}”. Try part of a medicine name, a customer’s name or the last digits of their phone.
            </li>
          )}
        </ul>
        <div className="nv-cmd__foot" aria-hidden="true">
          <span><kbd className="nv-kbd">↑</kbd><kbd className="nv-kbd">↓</kbd> move</span>
          <span><kbd className="nv-kbd">Enter</kbd> open</span>
        </div>
      </div>
    </dialog>
  );
}
