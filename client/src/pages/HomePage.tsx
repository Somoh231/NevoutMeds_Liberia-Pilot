import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BrandLogo from "@/components/BrandLogo";

type NavId = "home" | "features" | "why" | "pricing" | "contact";

function scrollToId(id: NavId) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const features = useMemo(
    () => [
      {
        title: "Price Compare",
        desc: "Instantly compare supplier quotes and identify the best landed cost—before you reorder.",
        icon: "💰"
      },
      {
        title: "Smart Inventory",
        desc: "Know what's critical, low, expiring, or overstocked at a glance—based on velocity and reorder points.",
        icon: "📦"
      },
      {
        title: "Expiry Alerts",
        desc: "Reduce expiry losses with early warnings and practical actions to move stock in time.",
        icon: "⏳"
      },
      {
        title: "AI Analyst",
        desc: "Operational insights that read like a manager: what’s happening, why it matters, and what to do next.",
        icon: "🧠"
      },
      {
        title: "Reports & Insights",
        desc: "Exportable views for products, customers, and performance—built for real-world decision making.",
        icon: "📈"
      },
      {
        title: "Cash Flow Tools",
        desc: "See credit exposure, supplier debt, and projected cash impact so you can protect margin and liquidity.",
        icon: "💳"
      }
    ],
    []
  );

  const pains = useMemo(
    () => [
      { title: "Overpaying suppliers", icon: "🧾" },
      { title: "Expired stock losses", icon: "🗓️" },
      { title: "Stockouts of key medicines", icon: "🚫" },
      { title: "Poor visibility into margins", icon: "🔎" },
      { title: "Cash tied in inventory", icon: "🔒" }
    ],
    []
  );

  const tiers = useMemo(
    () => [
      {
        name: "Pilot",
        price: "$0",
        sub: "for Liberia pilot partners",
        bullets: [
          "Price compare + smart inventory",
          "Expiry alerts + reminders",
          "Basic reporting",
          "WhatsApp-friendly workflows"
        ],
        accent: "linear-gradient(135deg, rgba(37,99,235,0.10), rgba(16,185,129,0.10))"
      },
      {
        name: "Growth",
        price: "Custom",
        sub: "for multi-branch pharmacies",
        bullets: [
          "Advanced analytics + exports",
          "Staff performance tracking",
          "Document management",
          "Implementation support"
        ],
        accent: "linear-gradient(135deg, rgba(6,182,212,0.10), rgba(37,99,235,0.10))"
      },
      {
        name: "Enterprise",
        price: "Custom",
        sub: "for distributors & networks",
        bullets: [
          "Integrations + APIs",
          "Role-based access",
          "Security reviews",
          "Dedicated success manager"
        ],
        accent: "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(20,184,166,0.10))"
      }
    ],
    []
  );

  return (
    <div className="heroWrap" id="home">
      <header className="nav">
        <div className="container">
          <div className="navInner">
            <Link to="/" className="brand" aria-label="NevOut Meds">
              <BrandLogo height={34} />
              <span>NevOut Meds</span>
            </Link>

            <nav className="navLinks" aria-label="Primary">
              <a
                href="#home"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("home");
                }}
              >
                Home
              </a>
              <a
                href="#features"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("features");
                }}
              >
                Features
              </a>
              <a
                href="#why"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("why");
                }}
              >
                Why Us
              </a>
              <a
                href="#pricing"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("pricing");
                }}
              >
                Pricing
              </a>
              <a
                href="#contact"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId("contact");
                }}
              >
                Contact
              </a>
            </nav>

            <div className="navActions">
              <button
                className="btn mobileOnly"
                type="button"
                onClick={() => setMobileOpen((v) => !v)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-menu"
              >
                Menu
              </button>

              <a className="btn btnGhost" href="#contact" onClick={(e) => (e.preventDefault(), scrollToId("contact"))}>
                Request Demo
              </a>
              <Link className="btn btnPrimary" to="/platform">
                Explore Platform →
              </Link>
            </div>
          </div>

          {mobileOpen && (
            <div
              id="mobile-menu"
              style={{
                padding: "10px 0 14px",
                display: "grid",
                gap: 8
              }}
            >
              {(
                [
                  ["Home", "home"],
                  ["Features", "features"],
                  ["Why Us", "why"],
                  ["Pricing", "pricing"],
                  ["Contact", "contact"]
                ] as const
              ).map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="btn"
                  onClick={(e) => {
                    e.preventDefault();
                    setMobileOpen(false);
                    scrollToId(id);
                  }}
                  style={{ justifyContent: "flex-start" }}
                >
                  {label}
                </a>
              ))}
              <Link className="btn btnPrimary" to="/platform" onClick={() => setMobileOpen(false)}>
                Explore Platform →
              </Link>
            </div>
          )}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container">
            <div className="heroGrid">
              <div>
                <div style={{ marginBottom: 14 }}>
                  <BrandLogo height={48} />
                </div>
                <div className="kicker">
                  <span aria-hidden="true">🌍</span> Built for real-world pharmacy purchasing
                </div>
                <h1 className="h1">Smarter Pharmacy Purchasing. Better Margins. Healthier Communities.</h1>
                <p className="sub">
                  NevOut Meds helps pharmacies reduce medicine costs, prevent stockouts, manage expiry risk, and improve cash flow with
                  intelligent purchasing tools built for real-world markets.
                </p>
                <div className="heroBtns">
                  <a className="btn btnPrimary" href="#contact" onClick={(e) => (e.preventDefault(), scrollToId("contact"))}>
                    Book Demo
                  </a>
                  <Link className="btn" to="/platform">
                    Explore Platform
                  </Link>
                  <Link className="btn btnGhost" to="/login">
                    Login
                  </Link>
                </div>

                <div className="trustRow" style={{ marginTop: 18 }}>
                  <span className="badge">Pilot-ready workflows</span>
                  <span className="badge">Inventory + purchasing intelligence</span>
                  <span className="badge">Designed for WhatsApp-first operations</span>
                </div>
              </div>

              <div className="heroCard" aria-label="Platform preview">
                <div className="heroCardTop">
                  <b>Today at a glance</b>
                  <span className="pill">LIVE PREVIEW</span>
                </div>
                <div className="metricGrid">
                  <div className="metric">
                    <div className="metricLabel">Stock alerts</div>
                    <div className="metricValue" style={{ color: "#ef4444" }}>
                      6
                    </div>
                    <div className="metricHint">critical + low + expiring</div>
                  </div>
                  <div className="metric">
                    <div className="metricLabel">Credit outstanding</div>
                    <div className="metricValue" style={{ color: "#f97316" }}>
                      $47
                    </div>
                    <div className="metricHint">across 3 customers</div>
                  </div>
                  <div className="metric">
                    <div className="metricLabel">Best supplier price</div>
                    <div className="metricValue" style={{ color: "#10b981" }}>
                      -12%
                    </div>
                    <div className="metricHint">vs current cost</div>
                  </div>
                  <div className="metric">
                    <div className="metricLabel">Cash risk</div>
                    <div className="metricValue" style={{ color: "#2563eb" }}>
                      On track
                    </div>
                    <div className="metricHint">30-day projection</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" aria-label="Problem">
          <div className="container">
            <h2 className="sectionTitle">The problem isn’t demand. It’s purchasing decisions.</h2>
            <p className="sectionSub">
              Pharmacies lose margin and trust when supply and visibility break down. NevOut Meds turns messy purchasing into a clear,
              repeatable, data-driven workflow.
            </p>
            <div className="painList">
              {pains.map((p) => (
                <div key={p.title} className="pain">
                  <span className="pill" style={{ borderColor: "rgba(37,99,235,0.20)" }}>
                    {p.icon}
                  </span>
                  <b>{p.title}</b>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Fixable with better signals, better ordering, and better follow-through.
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="features" aria-label="Features">
          <div className="container">
            <h2 className="sectionTitle">A platform built for margin, availability, and resilience</h2>
            <p className="sectionSub">
              Premium UX, practical workflows, and intelligence you can act on immediately—designed for operational teams, not just
              dashboards.
            </p>
            <div className="featureGrid">
              {features.map((f) => (
                <div key={f.title} className="card">
                  <div className="featureIcon" aria-hidden="true">
                    <span style={{ fontSize: 16 }}>{f.icon}</span>
                  </div>
                  <h3 className="cardTitle">{f.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="why" aria-label="Why Liberia pilot">
          <div className="container">
            <div className="grid2">
              <div className="card">
                <span className="pill" style={{ borderColor: "rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.06)" }}>
                  Why Liberia pilot
                </span>
                <h2 className="sectionTitle" style={{ marginTop: 12 }}>
                  Prove impact where it matters most
                </h2>
                <p className="sectionSub" style={{ marginBottom: 0 }}>
                  We’re starting in Liberia to prove how modern pharmacy intelligence can transform healthcare access in emerging markets.
                  The operational constraints are real—so when NevOut Meds works here, it works anywhere.
                </p>
              </div>
              <div className="card">
                <h3 className="cardTitle">What “success” looks like</h3>
                <div className="muted">
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                    <li>Lower cost per unit through consistent supplier comparison</li>
                    <li>Fewer stockouts for essential medicines</li>
                    <li>Reduced expiry losses with early alerts</li>
                    <li>Better cash flow visibility (credit + debt + projections)</li>
                    <li>Operational clarity for staff vs owner access</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="trustRow" style={{ marginTop: 18 }}>
              <span className="badge">Placeholder: Ministry / Regulator badge</span>
              <span className="badge">Placeholder: Partner pharmacies</span>
              <span className="badge">Placeholder: Distributor network</span>
            </div>
          </div>
        </section>

        <section className="section" aria-label="Testimonials">
          <div className="container">
            <h2 className="sectionTitle">Trusted by teams that need results</h2>
            <p className="sectionSub">Placeholder testimonials for now—swap these with real pilot quotes as they come in.</p>
            <div className="featureGrid">
              {[
                {
                  quote:
                    "“We stopped guessing. The reorder alerts + price compare showed us where we were losing money immediately.”",
                  name: "Pharmacy Owner",
                  org: "Monrovia (Pilot)"
                },
                {
                  quote:
                    "“Expiry risk used to surprise us. Now it’s visible early and we act before losses happen.”",
                  name: "Operations Lead",
                  org: "Community Pharmacy"
                },
                {
                  quote:
                    "“The staff vs owner sections reduce confusion. Everyone knows what they can access.”",
                  name: "Branch Manager",
                  org: "Multi-branch Pharmacy"
                }
              ].map((t) => (
                <div key={t.quote} className="card">
                  <div className="muted" style={{ fontSize: 14 }}>
                    {t.quote}
                  </div>
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {t.org}
                      </div>
                    </div>
                    <span className="pill">Verified</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="pricing" aria-label="Pricing">
          <div className="container">
            <h2 className="sectionTitle">Pricing</h2>
            <p className="sectionSub">
              Start with a pilot, then scale into growth and enterprise. We’ll tailor to your pharmacy size and workflow needs.
            </p>
            <div className="featureGrid">
              {tiers.map((t) => (
                <div key={t.name} className="card" style={{ background: t.accent }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <h3 className="cardTitle" style={{ marginBottom: 0 }}>
                      {t.name}
                    </h3>
                    <div style={{ fontWeight: 950, fontSize: 20 }}>{t.price}</div>
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    {t.sub}
                  </div>
                  <ul style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.85 }}>
                    {t.bullets.map((b) => (
                      <li key={b} style={{ fontWeight: 700, color: "rgba(15,23,42,0.72)" }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <a className="btn btnPrimary" href="#contact" onClick={(e) => (e.preventDefault(), scrollToId("contact"))}>
                      Request Demo
                    </a>
                    <Link className="btn" to="/platform">
                      Explore Platform
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="contact" aria-label="CTA / Contact">
          <div className="container">
            <div className="cta">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
                <div>
                  <h3>Ready to modernize your pharmacy?</h3>
                  <p>
                    Request a demo and we’ll walk you through supplier comparison, inventory intelligence, expiry risk, and cash flow tools.
                  </p>
                  <div className="ctaActions">
                    <Link className="btn btnPrimary" to="/platform">
                      Explore Platform →
                    </Link>
                    <Link className="btn" to="/login">
                      Login
                    </Link>
                  </div>
                </div>

                <form
                  onSubmit={(e) => e.preventDefault()}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 18,
                    padding: 16
                  }}
                >
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input
                        aria-label="Name"
                        placeholder="Name"
                        style={{
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(148,163,184,0.24)",
                          background: "rgba(255,255,255,0.10)",
                          color: "#e2e8f0",
                          outline: "none"
                        }}
                      />
                      <input
                        aria-label="Phone or WhatsApp"
                        placeholder="Phone / WhatsApp"
                        style={{
                          width: "100%",
                          padding: "11px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(148,163,184,0.24)",
                          background: "rgba(255,255,255,0.10)",
                          color: "#e2e8f0",
                          outline: "none"
                        }}
                      />
                    </div>
                    <input
                      aria-label="Pharmacy name"
                      placeholder="Pharmacy name"
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(148,163,184,0.24)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#e2e8f0",
                        outline: "none"
                      }}
                    />
                    <textarea
                      aria-label="What do you want to improve?"
                      placeholder="What do you want to improve? (stockouts, costs, expiry, cash flow...)"
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "11px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(148,163,184,0.24)",
                        background: "rgba(255,255,255,0.10)",
                        color: "#e2e8f0",
                        outline: "none",
                        resize: "vertical"
                      }}
                    />
                    <button className="btn btnPrimary" type="submit">
                      Request Demo
                    </button>
                    <div style={{ fontSize: 12, color: "rgba(226,232,240,0.70)", lineHeight: 1.5 }}>
                      This is a placeholder form. Wire it to email/CRM later.
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>

        <footer className="footer" aria-label="Footer">
          <div className="container">
            <div className="footerGrid">
              <div>
                <div className="brand">
                  <BrandLogo height={34} />
                  <span>NevOut Meds</span>
                </div>
                <p className="muted" style={{ margin: "10px 0 0" }}>
                  Smarter purchasing and inventory intelligence for pharmacies—built for emerging markets.
                </p>
                <div className="trustRow" style={{ marginTop: 12 }}>
                  <span className="badge">Blue/green healthcare palette</span>
                  <span className="badge">Responsive SaaS UI</span>
                </div>
              </div>

              <div>
                <h4>Company</h4>
                <a href="#why" onClick={(e) => (e.preventDefault(), scrollToId("why"))}>
                  Why us
                </a>
                <a href="#pricing" onClick={(e) => (e.preventDefault(), scrollToId("pricing"))}>
                  Pricing
                </a>
                <Link to="/platform">Platform</Link>
              </div>

              <div>
                <h4>Product</h4>
                <a href="#features" onClick={(e) => (e.preventDefault(), scrollToId("features"))}>
                  Features
                </a>
                <Link to="/login">Login</Link>
                <a href="#contact" onClick={(e) => (e.preventDefault(), scrollToId("contact"))}>
                  Request demo
                </a>
              </div>

              <div>
                <h4>Contact</h4>
                <a href="mailto:demo@nevoutmeds.com">demo@nevoutmeds.com</a>
                <a href="tel:+231000000000">+231 (placeholder)</a>
                <a href="#contact" onClick={(e) => (e.preventDefault(), scrollToId("contact"))}>
                  Book a demo
                </a>
              </div>
            </div>

            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(15,23,42,0.08)" }}>
              <div className="muted" style={{ fontSize: 12 }}>
                © {new Date().getFullYear()} NevOut Meds. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

