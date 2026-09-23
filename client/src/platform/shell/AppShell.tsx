import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown, Drawer, MenuItem, OfflineStatus, SyncStatus, cx } from "@/platform/ui";
import { CircleHelp, LayoutGrid, LogOut, ShieldCheck, Upload } from "@/platform/ui/icons";
import { BrandLockup, BrandMark } from "./Brand";
import { PHONE_PRIMARY, findItem, isOwnerRole, navFor, type NavItem, type ScreenId } from "./navigation";
import { useLayout } from "./useBreakpoint";

type ShellUser = { name: string; role: string; pharmacy: string };
type Props = {
  user: ShellUser;
  screen: ScreenId;
  onNavigate: (id: ScreenId) => void;
  /** Counts that need action, e.g. { inventory: 3, reminders: 2 }. */
  badges?: Partial<Record<ScreenId, number>>;
  onSignOut: () => void;
  onOpenHelp: () => void;
  children: ReactNode;
};

const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff", admin: "Platform admin" };
const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

function Count({ n, label, className }: { n?: number; label: string; className: string }) {
  if (!n) return null;
  return (
    <span className={className}>
      <span aria-hidden="true">{n > 99 ? "99+" : n}</span>
      <span className="nv-visually-hidden">, {n} {label}</span>
    </span>
  );
}
const countLabel = (id: string) => (id === "inventory" ? "stock alerts" : id === "reminders" ? "reminders due" : "items");

export default function AppShell({ user, screen, onNavigate, badges = {}, onSignOut, onOpenHelp, children }: Props) {
  const layout = useLayout();
  const navigate = useNavigate();
  const groups = navFor(user.role);
  const current = findItem(screen);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Title tells screen-reader users (and the browser tab) where they are.
  useEffect(() => {
    document.title = `${current?.item.label ?? "Workspace"} · ${user.pharmacy} · NevOut Meds`;
  }, [current?.item.label, user.pharmacy]);

  const go = (item: NavItem) => {
    setMoreOpen(false);
    if (item.href) {
      navigate(item.href);
      return;
    }
    onNavigate(item.id as ScreenId);
    window.scrollTo({ top: 0 });
  };

  const navButton = (item: NavItem, variant: "sidebar" | "rail") => {
    const active = item.id === screen;
    const Icon = item.icon;
    if (variant === "rail") {
      return (
        <button key={item.id} type="button" data-nav-id={item.id} className="nv-rail__item" aria-current={active ? "page" : undefined} onClick={() => go(item)}>
          <span className="nv-rail__icon"><Icon size={20} aria-hidden="true" /></span>
          <span>{item.label}</span>
          <Count n={badges[item.id as ScreenId]} label={countLabel(item.id)} className="nv-rail__count" />
        </button>
      );
    }
    return (
      <button key={item.id} type="button" data-nav-id={item.id} className="nv-nav__item" aria-current={active ? "page" : undefined} onClick={() => go(item)}>
        <Icon size={19} aria-hidden="true" />
        <span className="nv-nav__label">{item.label}</span>
        <Count n={badges[item.id as ScreenId]} label={countLabel(item.id)} className="nv-nav__count" />
      </button>
    );
  };

  const account = (
    <Dropdown
      label="Account"
      trigger={(p) => (
        <button type="button" className="nv-account-btn" aria-label={`Account menu for ${user.name}`} {...p}>
          <span className="nv-avatar" aria-hidden="true">{initials(user.name)}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="nv-menu__header">
            <div style={{ fontWeight: 650 }}>{user.name}</div>
            <div className="nv-hint">{ROLE_LABEL[user.role] ?? user.role} · {user.pharmacy}</div>
          </div>
          <div className="nv-menu__sep" role="separator" />
          <MenuItem icon={<CircleHelp size={18} aria-hidden="true" />} onSelect={() => { close(); onOpenHelp(); }}>Help & feedback</MenuItem>
          {isOwnerRole(user.role) && (
            <MenuItem icon={<Upload size={18} aria-hidden="true" />} onSelect={() => { close(); navigate("/import"); }}>Import data</MenuItem>
          )}
          {user.role === "admin" && (
            <MenuItem icon={<ShieldCheck size={18} aria-hidden="true" />} onSelect={() => { close(); navigate("/admin"); }}>Admin console</MenuItem>
          )}
          <div className="nv-menu__sep" role="separator" />
          <MenuItem danger icon={<LogOut size={18} aria-hidden="true" />} onSelect={() => { close(); onSignOut(); }}>Sign out</MenuItem>
        </>
      )}
    </Dropdown>
  );

  const phonePrimary = PHONE_PRIMARY.map((id) => findItem(id)!.item);
  const moreItems = groups.flatMap((g) => g.items).filter((i) => !PHONE_PRIMARY.includes(i.id as ScreenId));
  const moreActive = !PHONE_PRIMARY.includes(screen);

  return (
    <div className={cx("nv-app nv-shell", `nv-shell--${layout}`)}>
      <a
        className="nv-skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>

      {layout === "desktop" && (
        <aside className="nv-sidebar" aria-label="Workspace">
          <div className="nv-sidebar__brand"><BrandLockup size={28} /></div>
          <div className="nv-pharmacy">
            <span className="nv-pharmacy__mark" aria-hidden="true">{initials(user.pharmacy)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="nv-pharmacy__name">{user.pharmacy}</div>
              <div className="nv-pharmacy__role">{ROLE_LABEL[user.role] ?? user.role}</div>
            </div>
          </div>
          <nav className="nv-nav" aria-label="Main">
            {groups.map((g) => (
              <div key={g.id} className="nv-nav__group" role="group" aria-labelledby={`nav-${g.id}`}>
                <div id={`nav-${g.id}`} className="nv-nav__heading">{g.label}</div>
                {g.items.map((i) => navButton(i, "sidebar"))}
              </div>
            ))}
          </nav>
        </aside>
      )}

      {layout === "tablet" && (
        <aside className="nv-rail" aria-label="Workspace">
          <div className="nv-rail__brand"><BrandMark size={30} /></div>
          <nav className="nv-rail__list" aria-label="Main">
            {groups.map((g, gi) => (
              <div key={g.id} role="group" aria-label={g.label} style={{ display: "grid", gap: 2 }}>
                {gi > 0 && <div className="nv-rail__sep" aria-hidden="true" />}
                {g.items.map((i) => navButton(i, "rail"))}
              </div>
            ))}
          </nav>
        </aside>
      )}

      <div className="nv-shell__content">
        <header className="nv-topbar">
          {layout === "phone" && <BrandMark size={26} />}
          <div className="nv-topbar__titles">
            <div className="nv-topbar__eyebrow">{layout === "desktop" ? current?.group.label : user.pharmacy}</div>
            <h1 className="nv-topbar__title">{current?.item.label ?? "Workspace"}</h1>
          </div>
          <div className="nv-topbar__actions">
            <SyncStatus compact={layout === "phone"} />
            {account}
          </div>
        </header>
        <OfflineStatus />
        <main id="main" ref={mainRef} tabIndex={-1} className="nv-main">
          {children}
        </main>
      </div>

      {layout === "phone" && (
        <>
          <nav className="nv-bottomnav" aria-label="Main">
            {phonePrimary.map((item) => {
              const Icon = item.icon;
              const active = item.id === screen;
              return (
                <button key={item.id} type="button" data-nav-id={item.id} className="nv-bottomnav__item" aria-current={active ? "page" : undefined} onClick={() => go(item)}>
                  <span className="nv-bottomnav__icon"><Icon size={22} aria-hidden="true" /></span>
                  <span className="nv-bottomnav__label">{item.label}</span>
                  <Count n={badges[item.id as ScreenId]} label={countLabel(item.id)} className="nv-bottomnav__count" />
                </button>
              );
            })}
            <button
              type="button"
              className="nv-bottomnav__item"
              data-nav-more=""
              aria-current={moreActive ? "page" : undefined}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
            >
              <span className="nv-bottomnav__icon"><LayoutGrid size={22} aria-hidden="true" /></span>
              <span className="nv-bottomnav__label">More</span>
            </button>
          </nav>
          <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
            {groups
              .map((g) => ({ ...g, items: g.items.filter((i) => moreItems.includes(i)) }))
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <section key={g.id} aria-labelledby={`more-${g.id}`} style={{ marginBottom: 20 }}>
                  <h3 id={`more-${g.id}`} className="nv-nav__heading" style={{ padding: "0 0 8px" }}>{g.label}</h3>
                  <div className="nv-more-grid">
                    {g.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.id} type="button" data-nav-id={item.id} className="nv-more-tile" aria-current={item.id === screen ? "page" : undefined} onClick={() => go(item)}>
                          <span className="nv-more-tile__icon"><Icon size={20} aria-hidden="true" /></span>
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
          </Drawer>
        </>
      )}
    </div>
  );
}
