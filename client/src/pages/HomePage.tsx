import "./home.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLockup } from "@/platform/shell/Brand";
import {
  ArrowRight, CalendarClock, Check, CircleCheck, CloudUpload, FileBarChart, Menu, Package, ShieldCheck,
  ShoppingCart, Sparkles, TriangleAlert, Truck, UserCog, Wallet, WifiOff, X
} from "@/platform/ui/icons";

/** Public contact address for demo requests (the only contact channel on this page). */
const DEMO_EMAIL = "demo@nevoutmeds.com";

/*
 * Public site (Phase 11). Lazy-loaded: none of this reaches the pharmacy workspace bundle.
 *
 * Composition follows the scroll-world model — numbered chapters pinned beside a
 * scene that changes as you scroll, with a route rail — but the scenes are live
 * HTML previews of the product (labelled sample data), not pre-rendered video:
 * that pipeline would add ~90 MB of clips, which Liberian 3G can't carry.
 * Reduced motion and phones get the same story as a simple stacked page.
 */

const CHAPTERS = [
  { id: "morning", time: "07:30", eyebrow: "Morning briefing", title: "Know what needs you first.", body: "Before the shutters open, NevOut Meds ranks the day: what is out of stock, what expires soon, which refills are due and where a supplier is cheaper. One decision at the top; everything else in order.", tags: ["Ranked by urgency", "Linked to the fix"] },
  { id: "counter", time: "10:15", eyebrow: "At the counter", title: "Sell in seconds, online or not.", body: "Find the customer, add the medicines, take payment. If the connection drops, the sale is saved on the phone and sent automatically when it returns, exactly once. Nobody re-types anything.", tags: ["Works offline", "Allergies shown at the till"] },
  { id: "shelf", time: "13:00", eyebrow: "On the shelf", title: "Stock you can trust.", body: "Every sale and every adjustment is a recorded movement with a name on it. Days of stock, reorder points and expiry sit on one line per product, so twenty products read in a glance.", tags: ["Audited movements", "Expiry on every line"] },
  { id: "buying", time: "15:40", eyebrow: "Buying", title: "Pay the best price you were quoted.", body: "Record what suppliers quote and NevOut Meds ranks them by the real order total — minimum orders, availability and lead time included — then writes the WhatsApp order for you.", tags: ["Ranked by order total", "Currencies never mixed"] },
  { id: "evening", time: "19:00", eyebrow: "Closing up", title: "See where the money is.", body: "Revenue, cost of goods, credit you are owed and cash tied up in slow stock — from recorded sales only. What isn’t recorded is shown as blank, never estimated.", tags: ["No invented numbers", "Exports to any spreadsheet"] }
] as const;

const CAPABILITIES: Array<{ icon: ReactNode; title: string; body: string }> = [
  { icon: <Package size={20} />, title: "Inventory", body: "Stock, reorder points, days of stock and expiry on one line, with a full movement history." },
  { icon: <ShoppingCart size={20} />, title: "Sales & offline", body: "A fast till that keeps working without a connection and syncs every sale exactly once." },
  { icon: <CalendarClock size={20} />, title: "Expiry", body: "Grouped by urgency with the value at risk and a recommended action for each batch." },
  { icon: <Truck size={20} />, title: "Suppliers & orders", body: "Recorded quotes ranked by order total; orders written for WhatsApp in a tap." },
  { icon: <Sparkles size={20} />, title: "Analyst", body: "Findings from your own records: what happened, why it matters, what to do and the evidence." },
  { icon: <FileBarChart size={20} />, title: "Reports & financials", body: "Sales, margin, credit and stock value over 7, 30 or 90 days. Every report exports as CSV." },
  { icon: <UserCog size={20} />, title: "Staff & roles", body: "Each person signs in as themselves. Owners see the money screens; staff see the counter." },
  { icon: <ShieldCheck size={20} />, title: "Private by design", body: "Each pharmacy sees only its own records, enforced on the server, not just hidden in the app." }
];

// Pricing content is the owner's (kept as written; tiers flagged for owner review in Phase 8).
const TIERS = [
  { name: "Pilot", price: "$0", sub: "for Liberia pilot partners", bullets: ["Price compare + smart inventory", "Expiry alerts + reminders", "Basic reporting", "WhatsApp-friendly workflows"], featured: true },
  { name: "Growth", price: "Custom", sub: "for multi-branch pharmacies", bullets: ["Advanced analytics + exports", "Staff performance tracking", "Document management", "Implementation support"] },
  { name: "Enterprise", price: "Custom", sub: "for distributors & networks", bullets: ["Integrations + APIs", "Role-based access", "Security reviews", "Dedicated success manager"] }
];

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const storyRef = useRef<HTMLDivElement>(null);
  const heroScene = useRef<HTMLDivElement>(null);

  // Chapter tracking: the chapter whose copy crosses the middle of the screen drives the pinned scene.
  useEffect(() => {
    const els = [...(storyRef.current?.querySelectorAll<HTMLElement>("[data-chapter]") ?? [])];
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.chapter))),
      { rootMargin: "-45% 0px -45% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Hero depth: the product preview settles from a tilt as the page scrolls (fine pointers, motion allowed).
  useEffect(() => {
    if (reduceMotion() || !window.matchMedia("(min-width: 960px)").matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = Math.min(1, window.scrollY / 520);
        heroScene.current?.style.setProperty("--tilt", String(1 - t));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  };
  const NAV = [["product", "Product"], ["day", "How it works"], ["pilot", "Pilot"], ["pricing", "Pricing"], ["contact", "Contact"]] as const;

  return (
    <div className="nv-site">
      <a className="nv-skip-link" href="#main">Skip to content</a>
      <header className="nv-site__nav">
        <div className="nv-site__wrap nv-site__navin">
          <Link to="/" aria-label="NevOut Meds home"><BrandLockup size={28} /></Link>
          <nav className="nv-site__links" aria-label="Primary">
            {NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)}>{label}</a>)}
          </nav>
          <div className="nv-site__navcta">
            <Link className="nv-sbtn nv-sbtn--ghost" to="/login">Sign in</Link>
            <a className="nv-sbtn nv-sbtn--primary" href="#contact" onClick={go("contact")}>Request a demo</a>
            <button type="button" className="nv-site__menubtn" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen((v) => !v)}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="site-menu" className="nv-site__sheet" aria-label="Menu">
            {NAV.map(([id, label]) => <a key={id} href={`#${id}`} onClick={go(id)}>{label}</a>)}
            <Link className="nv-sbtn nv-sbtn--ghost" to="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
          </nav>
        )}
      </header>

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="nv-site__hero" aria-labelledby="hero-h">
          <div className="nv-site__mesh" aria-hidden="true" />
          <div className="nv-site__wrap nv-site__herogrid">
            <div className="nv-site__herocopy">
              <p className="nv-site__eyebrow">Pharmacy operations · piloting in Liberia</p>
              <h1 id="hero-h" className="nv-site__h1">Every medicine accounted for. Even when the connection isn’t.</h1>
              <p className="nv-site__lede">
                NevOut Meds is the operating system for pharmacy teams: stock, sales, expiry, suppliers and credit in one calm workspace
                that keeps working offline and shows only numbers you actually recorded.
              </p>
              <div className="nv-site__ctas">
                <a className="nv-sbtn nv-sbtn--primary nv-sbtn--lg" href="#contact" onClick={go("contact")}>Request a demo <ArrowRight size={18} /></a>
                <Link className="nv-sbtn nv-sbtn--onstrong nv-sbtn--lg" to="/login">Sign in to your pharmacy</Link>
              </div>
            </div>
            <div className="nv-site__herostage" ref={heroScene} aria-hidden="true">
              <div className="nv-site__device">
                <span className="nv-site__sample">Sample data</span>
                <SceneBriefing />
              </div>
            </div>
          </div>
        </section>

        {/* ── Proof: facts the product can back up ─────────────────────────── */}
        <section className="nv-site__proof" aria-label="What NevOut Meds guarantees">
          <div className="nv-site__wrap nv-site__proofgrid">
            <Proof icon={<WifiOff size={18} />} title="Works offline" body="Sales are saved on the phone and sync exactly once." />
            <Proof icon={<ShieldCheck size={18} />} title="Private by design" body="Each pharmacy sees only its own records." />
            <Proof icon={<CloudUpload size={18} />} title="Built for 3G" body="About 160 kB to start; no third-party trackers." />
            <Proof icon={<CircleCheck size={18} />} title="No invented numbers" body="Anything not recorded is shown as blank." />
          </div>
        </section>

        {/* ── The day, as a pinned story ────────────────────────────────────── */}
        <section id="day" className="nv-site__story" aria-labelledby="day-h">
          <div className="nv-site__wrap">
            <p className="nv-site__eyebrow nv-site__eyebrow--dark">How it works</p>
            <h2 id="day-h" className="nv-site__h2">One day in a pharmacy that runs on NevOut Meds.</h2>
          </div>
          <div className="nv-site__wrap nv-site__storygrid" ref={storyRef}>
            <div className="nv-site__pin" aria-hidden="true">
              <div className="nv-site__device nv-site__device--light">
                <span className="nv-site__sample nv-site__sample--light">Sample data</span>
                {CHAPTERS.map((c, i) => (
                  <div key={c.id} className="nv-site__scene" data-on={i === active}>
                    {i === 0 && <SceneBriefing light />}
                    {i === 1 && <SceneSale />}
                    {i === 2 && <SceneShelf />}
                    {i === 3 && <SceneCompare />}
                    {i === 4 && <SceneStatement />}
                  </div>
                ))}
              </div>
              <ol className="nv-site__rail">
                {CHAPTERS.map((c, i) => <li key={c.id} data-on={i === active}><span>{c.eyebrow}</span></li>)}
              </ol>
            </div>
            <div className="nv-site__chapters">
              {CHAPTERS.map((c, i) => (
                <article key={c.id} className="nv-site__chapter" data-chapter={i} data-on={i === active} aria-labelledby={`ch-${c.id}`}>
                  <div className="nv-site__inline-scene" aria-hidden="true">
                    <div className="nv-site__device nv-site__device--light">
                      <span className="nv-site__sample nv-site__sample--light">Sample data</span>
                      {i === 0 && <SceneBriefing light />}
                      {i === 1 && <SceneSale />}
                      {i === 2 && <SceneShelf />}
                      {i === 3 && <SceneCompare />}
                      {i === 4 && <SceneStatement />}
                    </div>
                  </div>
                  <p className="nv-site__chnum"><span>{String(i + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")}</span> · {c.time}</p>
                  <p className="nv-site__cheyebrow">{c.eyebrow}</p>
                  <h3 id={`ch-${c.id}`} className="nv-site__chtitle">{c.title}</h3>
                  <p className="nv-site__chbody">{c.body}</p>
                  <ul className="nv-site__tags">{c.tags.map((t) => <li key={t}><Check size={14} aria-hidden="true" /> {t}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Capabilities ─────────────────────────────────────────────────── */}
        <section id="product" className="nv-site__section" aria-labelledby="product-h">
          <div className="nv-site__wrap">
            <p className="nv-site__eyebrow nv-site__eyebrow--dark">Product</p>
            <h2 id="product-h" className="nv-site__h2">Everything a pharmacy runs on, in one place.</h2>
            <div className="nv-site__caps">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="nv-site__cap">
                  <span className="nv-site__capicon" aria-hidden="true">{c.icon}</span>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pilot ───────────────────────────────────────────────────────── */}
        <section id="pilot" className="nv-site__section nv-site__section--tint" aria-labelledby="pilot-h">
          <div className="nv-site__wrap nv-site__pilot">
            <div>
              <p className="nv-site__eyebrow nv-site__eyebrow--dark">The Liberia pilot</p>
              <h2 id="pilot-h" className="nv-site__h2">Proving it where the constraints are real.</h2>
              <p className="nv-site__p">
                We are starting with a small number of pharmacies in Liberia: patchy power, mobile data, cash and credit at the counter,
                WhatsApp for suppliers. If NevOut Meds works well here, it will work in most places.
              </p>
            </div>
            <div className="nv-site__card">
              <h3 className="nv-site__h3">What success looks like</h3>
              <ul className="nv-site__checks">
                {["Lower cost per unit through consistent supplier comparison", "Fewer stockouts of essential medicines", "Smaller expiry losses, caught early", "A clear money picture: sales, customer credit, stock value and open orders", "Staff and owners each see what their role needs"].map((t) => (
                  <li key={t}><Check size={16} aria-hidden="true" /> {t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────────────────── */}
        <section id="pricing" className="nv-site__section" aria-labelledby="pricing-h">
          <div className="nv-site__wrap">
            <p className="nv-site__eyebrow nv-site__eyebrow--dark">Pricing</p>
            <h2 id="pricing-h" className="nv-site__h2">Start with the pilot. Grow when it’s proven.</h2>
            <div className="nv-site__tiers">
              {TIERS.map((t) => (
                <div key={t.name} className={`nv-site__tier${t.featured ? " is-featured" : ""}`}>
                  <div className="nv-site__tierhead"><h3>{t.name}</h3><span className="nv-site__price">{t.price}</span></div>
                  <p className="nv-site__tiersub">{t.sub}</p>
                  <ul className="nv-site__checks">{t.bullets.map((b) => <li key={b}><Check size={16} aria-hidden="true" /> {b}</li>)}</ul>
                  <a className={`nv-sbtn ${t.featured ? "nv-sbtn--primary" : "nv-sbtn--outline"}`} href="#contact" onClick={go("contact")}>Request a demo</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact ─────────────────────────────────────────────────────── */}
        <section id="contact" className="nv-site__contact" aria-labelledby="contact-h">
          <div className="nv-site__mesh nv-site__mesh--quiet" aria-hidden="true" />
          <div className="nv-site__wrap nv-site__contactgrid">
            <div>
              <h2 id="contact-h" className="nv-site__h2 nv-site__h2--light">See it with your own stock list.</h2>
              <p className="nv-site__lede">We will walk you through the counter, stock, expiry and supplier comparison using your pharmacy’s real workflow.</p>
              <Link className="nv-sbtn nv-sbtn--onstrong" to="/login">Already a pilot pharmacy? Sign in</Link>
            </div>
            <form
              className="nv-site__form"
              onSubmit={(e) => {
                // No backend collects these details: the visitor's own email
                // app opens with them filled in, and they choose to send it.
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const v = (k: string) => String(f.get(k) ?? "").trim();
                const body = [`Name: ${v("name")}`, `Phone / WhatsApp: ${v("phone")}`, `Pharmacy: ${v("pharmacy")}`, "", v("message")].join("\n");
                window.location.href = `mailto:${DEMO_EMAIL}?subject=${encodeURIComponent(`Demo request: ${v("pharmacy") || "pharmacy"}`)}&body=${encodeURIComponent(body)}`;
              }}
            >
              <div className="nv-site__formrow">
                <label><span>Name</span><input name="name" required autoComplete="name" /></label>
                <label><span>Phone / WhatsApp</span><input name="phone" type="tel" required autoComplete="tel" /></label>
              </div>
              <label><span>Pharmacy name</span><input name="pharmacy" autoComplete="organization" /></label>
              <label><span>What do you want to improve?</span><textarea name="message" rows={3} placeholder="Stockouts, costs, expiry, cash flow…" /></label>
              <button className="nv-sbtn nv-sbtn--primary nv-sbtn--lg" type="submit">Email your request</button>
              <p className="nv-site__formnote">Opens your email app with these details filled in. Nothing is sent until you press send there.</p>
            </form>
          </div>
        </section>
      </main>

      <footer className="nv-site__footer">
        <div className="nv-site__wrap nv-site__footgrid">
          <div>
            <BrandLockup size={26} />
            <p>Pharmacy operations that keep working offline.</p>
          </div>
          <nav aria-label="Footer">
            <a href="#product" onClick={go("product")}>Product</a>
            <a href="#pricing" onClick={go("pricing")}>Pricing</a>
            <Link to="/login">Sign in</Link>
            <a href={`mailto:${DEMO_EMAIL}`}>{DEMO_EMAIL}</a>
          </nav>
          <p className="nv-site__copy">© {new Date().getFullYear()} NevOut Meds</p>
        </div>
      </footer>
    </div>
  );
}

function Proof({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="nv-site__proofitem">
      <span className="nv-site__proofico" aria-hidden="true">{icon}</span>
      <div><b>{title}</b><span>{body}</span></div>
    </div>
  );
}

/* ── Product scenes: miniature, static, sample data only ─────────────────── */
function SceneBriefing({ light }: { light?: boolean }) {
  return (
    <div className={`nv-mini${light ? " nv-mini--light" : ""}`}>
      <div className="nv-mini__head"><span>Thursday</span><b>Good morning</b></div>
      <div className="nv-mini__decision">
        <span className="nv-mini__ico nv-mini__ico--danger"><TriangleAlert size={16} /></span>
        <div><small>Decide now</small><b>3 medicines out of stock or critically low</b></div>
        <span className="nv-mini__btn">Reorder</span>
      </div>
      <div className="nv-mini__queue">
        <div><span className="nv-mini__ico nv-mini__ico--warn"><CalendarClock size={14} /></span><p>4 products expire within 30 days</p></div>
        <div><span className="nv-mini__ico nv-mini__ico--brand"><Wallet size={14} /></span><p>Cheaper price recorded for 6 products</p></div>
      </div>
      <div className="nv-mini__pulse"><div><small>Sales today</small><b>US$184.50</b></div><div><small>Credit owed</small><b>US$62.00</b></div></div>
    </div>
  );
}
function SceneSale() {
  return (
    <div className="nv-mini nv-mini--light">
      <div className="nv-mini__chip nv-mini__chip--offline"><WifiOff size={13} /> Offline · saved on this device</div>
      <div className="nv-mini__lines">
        <div><p>Amoxicillin 500mg</p><span>× 2</span><b>US$4.50</b></div>
        <div><p>ORS sachet</p><span>× 3</span><b>US$0.90</b></div>
      </div>
      <div className="nv-mini__total"><div><small>Total · Cash</small><b>US$5.40</b></div><span className="nv-mini__btn">Record sale</span></div>
      <div className="nv-mini__chip nv-mini__chip--synced"><CircleCheck size={13} /> Back online · synced once</div>
    </div>
  );
}
function SceneShelf() {
  const rows = [["Paracetamol 500mg", 140, 70, "Healthy"], ["Amlodipine 5mg", 9, 18, "Low"], ["Cotrimoxazole 480mg", 3, 6, "Critical"], ["Zinc 20mg", 88, 60, "Expiring"]] as const;
  return (
    <div className="nv-mini nv-mini--light">
      <div className="nv-mini__rows">
        {rows.map(([n, q, pct, st]) => (
          <div key={n}>
            <p>{n}</p>
            <b>{q}</b>
            <span className="nv-mini__meter"><i style={{ width: `${pct}%` }} data-st={st} /></span>
            <em data-st={st}>{st}</em>
          </div>
        ))}
      </div>
    </div>
  );
}
function SceneCompare() {
  return (
    <div className="nv-mini nv-mini--light">
      <div className="nv-mini__best">
        <small>Best recorded price</small>
        <div><b>Wholesaler A</b><strong>US$0.81</strong></div>
        <p>Order total US$73.71 · save US$8.19 vs what you pay</p>
        <span className="nv-mini__bar"><i style={{ width: "78%" }} /></span>
      </div>
      <div className="nv-mini__alt"><p>Wholesaler B</p><strong>US$0.87</strong><span className="nv-mini__bar nv-mini__bar--quiet"><i style={{ width: "86%" }} /></span></div>
      <div className="nv-mini__alt"><p>Wholesaler C</p><strong>US$0.94</strong><span className="nv-mini__bar nv-mini__bar--quiet"><i style={{ width: "100%" }} /></span></div>
    </div>
  );
}
function SceneStatement() {
  return (
    <div className="nv-mini nv-mini--light">
      <div className="nv-mini__stmt">
        <div><p>Revenue · 30 days</p><b>US$2,418.60</b></div>
        <div><p>Cost of goods</p><b>−US$1,160.90</b></div>
        <div className="is-total"><p>Gross profit</p><b>US$1,257.70</b></div>
        <div><p>Credit you are owed</p><b>US$186.00</b></div>
        <div className="is-blank"><p>Cash on hand</p><b>Not recorded</b></div>
      </div>
    </div>
  );
}
