import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { LR_COMMUNITIES, LR_COUNTIES } from "@/platform/seed/liberiaGeo";
import { fmt } from "@/platform/utils/format";
import { validateNewCustomer } from "@/platform/features/customers/rules";
import { applyPurchaseToCustomer, buildNewCustomerRecord, buildPurchaseItemString, calcPurchaseAmount, todayISO } from "@/platform/features/customers/purchases";
import { Avatar, Field, Input, Modal, SectionHead } from "@/platform/components/primitives";

export default function CustomersScreen({ customers, setCustomers, medicines, onShowToast, dataStatus, onRecordPurchase }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [addPurchase, setAddPurchase] = useState(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ medicine: "", qty: 1, method: "Cash" });
  const [customerForm, setCustomerForm] = useState({ firstName: "", lastName: "", phone: "", altPhone: "", altName: "", dob: "", gender: "Female", community: "", landmark: "", county: "Montserrado", conditions: "", allergies: "", notes: "" });
  const [phoneError, setPhoneError] = useState("");

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q) || c.phone.includes(q) || c.community.toLowerCase().includes(q);
  });
  const totalCredit = customers.reduce((s, c) => s + c.creditBalance, 0);

  const commitPurchase = async () => {
    if (!purchaseForm.medicine) return;
    const med = medicines.find((m) => String(m.id) === String(purchaseForm.medicine));
    if (!med) return;
    const amount = calcPurchaseAmount(med, purchaseForm.qty);
    const items = buildPurchaseItemString(med.name, purchaseForm.qty);
    const date = todayISO();
    if (typeof onRecordPurchase === "function") {
      try {
        await onRecordPurchase({
          customerId: addPurchase.id,
          method: purchaseForm.method,
          items: [{ productId: String(med.id), name: med.name, qty: purchaseForm.qty, unitPrice: med.sellingPrice }]
        });
        // Only update local UI after success (prevents corruption on failure)
        setCustomers((prev) => prev.map((c) => (c.id === addPurchase.id ? applyPurchaseToCustomer(c, { items, amount, method: purchaseForm.method, staffId: 1, date }) : c)));
        onShowToast(`Purchase recorded — ${fmt(amount)}`, "success");
        setAddPurchase(null);
        setPurchaseForm({ medicine: "", qty: 1, method: "Cash" });
      } catch (e) {
        onShowToast("Purchase failed — please try again", "info");
      }
      return;
    }

    setCustomers((prev) => prev.map((c) => (c.id === addPurchase.id ? applyPurchaseToCustomer(c, { items, amount, method: purchaseForm.method, staffId: 1, date }) : c)));
    onShowToast(`Purchase recorded — ${fmt(amount)}`, "success");
    setAddPurchase(null);
    setPurchaseForm({ medicine: "", qty: 1, method: "Cash" });
  };

  const commitNew = () => {
    const v = validateNewCustomer({ phone: customerForm.phone, firstName: customerForm.firstName, lastName: customerForm.lastName }, customers);
    if (!v.ok) {
      if (v.error) setPhoneError(v.error);
      return;
    }
    setPhoneError("");
    setCustomers((prev) => [...prev, buildNewCustomerRecord(prev, customerForm, v.phone)]);
    onShowToast(`${customerForm.firstName} registered`, "success");
    setNewCustomer(false);
    setCustomerForm({ firstName: "", lastName: "", phone: "", altPhone: "", altName: "", dob: "", gender: "Female", community: "", landmark: "", county: "Montserrado", conditions: "", allergies: "", notes: "" });
  };

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Customer Profiles</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {customers.length} registered · {fmt(totalCredit)} credit out
          </div>
          <div style={{ fontSize: 12, marginTop: 6, fontWeight: 700, color: dataStatus?.error ? "#f97316" : "#94a3b8" }}>
            {dataStatus?.loading ? "Syncing…" : dataStatus?.error ? "Using cached data" : ""}
          </div>
        </div>
        <button onClick={() => setNewCustomer(true)} style={{ padding: "10px 16px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
          + Register Patient
        </button>
      </div>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} width="13" height="13" fill="none" stroke="#334155" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone, or community…" style={{ width: "100%", padding: "10px 12px 10px 32px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box", background: "#fff" }} />
      </div>
      {filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "40px 18px", textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: 26, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>No customers found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Register a patient or adjust your search.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {filtered.map((c, idx) => (
          <div
            key={c.id}
            onClick={() => setSelected(selected?.id === c.id ? null : c)}
            style={{
              background: "#fff",
              borderRadius: 16,
              border: `1.5px solid ${selected?.id === c.id ? "#10b981" : "#e2e8f0"}`,
              padding: "18px",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: selected?.id === c.id ? "0 4px 16px #10b98115" : "0 1px 3px #0000000a",
              animation: `fadeUp 0.3s ${idx * 0.04}s both`
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Avatar name={`${c.firstName} ${c.lastName}`} size={38} bg={`hsl(${c.id * 60},60%,50%)`} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: SLATE }}>
                    {c.firstName} {c.lastName}
                  </div>
                  <div style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>📞 {c.phone}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: SLATE }}>{fmt(c.totalSpend)}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>{c.visitCount} visits</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 8, padding: "6px 9px", background: "#f8fafc", borderRadius: 7 }}>
              <span style={{ fontSize: 11, marginTop: 1 }}>📍</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
                  {c.community}
                  {c.county ? `, ${c.county}` : ""}
                </div>
                {c.landmark && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{c.landmark}</div>}
              </div>
            </div>
            {c.conditions.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>{c.conditions.map((co, i) => <span key={i} style={{ padding: "2px 7px", borderRadius: 99, background: "#eff6ff", color: "#2563eb", fontSize: 10, fontWeight: 700 }}>{co}</span>)}</div>}
            {c.allergies.length > 0 && <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>{c.allergies.map((a, i) => <span key={i} style={{ padding: "2px 7px", borderRadius: 99, background: "#fef2f2", color: "#ef4444", fontSize: 10, fontWeight: 700 }}>⚠ {a}</span>)}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #f1f5f9", marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Last: {c.lastVisit}</div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {c.creditBalance > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316", background: "#fff7ed", padding: "2px 7px", borderRadius: 99 }}>{fmt(c.creditBalance)} credit</span>}
                <button onClick={(e) => { e.stopPropagation(); setAddPurchase(c); }} style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: GREEN, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  + Sale
                </button>
              </div>
            </div>
            {selected?.id === c.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                {c.altPhone && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>👤 {c.altName || "Alt"} · {c.altPhone}</div>}
                {c.notes && <div style={{ padding: "7px 9px", background: "#fffbeb", borderRadius: 7, border: "1px solid #fde68a", fontSize: 11, color: "#78350f", marginBottom: 8, lineHeight: 1.5 }}>📝 {c.notes}</div>}
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Purchase History</div>
                {c.purchases.slice(0, 3).map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f8fafc", fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#334155" }}>{p.items}</div>
                      <div style={{ color: "#94a3b8", fontSize: 10 }}>
                        {p.date} · {p.method}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: p.method === "Credit" ? "#f97316" : SLATE }}>{fmt(p.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          ))}
        </div>
      )}
      <Modal open={!!addPurchase} onClose={() => setAddPurchase(null)}>
        {addPurchase && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Record Purchase</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: addPurchase.allergies.length > 0 ? 10 : 18 }}>
              {addPurchase.firstName} {addPurchase.lastName} · 📞 {addPurchase.phone}
            </div>
            {addPurchase.allergies.length > 0 && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "9px 12px", marginBottom: 14, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>⚠ Allergy alert: {addPurchase.allergies.join(", ")}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Medicine</label>
              <select value={purchaseForm.medicine} onChange={(e) => setPurchaseForm((p) => ({ ...p, medicine: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", background: "#fff" }}>
                <option value="">Select…</option>
                {medicines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {fmt(m.sellingPrice)}/{m.unit.replace(/s$/, "")}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Qty</label>
                <input type="number" min={1} value={purchaseForm.qty} onChange={(e) => setPurchaseForm((p) => ({ ...p, qty: parseInt(e.target.value) || 1 }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Payment</label>
                <select value={purchaseForm.method} onChange={(e) => setPurchaseForm((p) => ({ ...p, method: e.target.value }))} style={{ width: "100%", padding: "10px 11px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", background: "#fff" }}>
                  {["Cash", "Mobile Money", "Credit", "Diaspora Pay", "Insurance"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            {purchaseForm.medicine && (
              <div style={{ background: "#f0fdf4", borderRadius: 9, padding: "11px 13px", marginBottom: 16, border: "1px solid #bbf7d0", fontSize: 13, fontWeight: 700, color: "#065f46" }}>
                Total: {fmt((medicines.find((m) => String(m.id) === String(purchaseForm.medicine))?.sellingPrice || 0) * purchaseForm.qty)}
                {purchaseForm.method === "Credit" && <span style={{ fontSize: 11, color: "#f97316", fontWeight: 600, display: "block", marginTop: 3 }}>⚠ Adds to credit balance</span>}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAddPurchase(null)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={commitPurchase} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Record Purchase
              </button>
            </div>
          </>
        )}
      </Modal>
      <Modal open={newCustomer} onClose={() => setNewCustomer(false)} maxW={540}>
        <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Register New Patient</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 18 }}>Phone number is the unique identifier</div>
        <SectionHead label="Identity" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <Field label="First Name *">
            <Input value={customerForm.firstName} onChange={(e) => setCustomerForm((p) => ({ ...p, firstName: e.target.value }))} />
          </Field>
          <Field label="Last Name *">
            <Input value={customerForm.lastName} onChange={(e) => setCustomerForm((p) => ({ ...p, lastName: e.target.value }))} />
          </Field>
          <Field label="Date of Birth">
            <Input type="date" value={customerForm.dob} onChange={(e) => setCustomerForm((p) => ({ ...p, dob: e.target.value }))} />
          </Field>
          <Field label="Gender">
            <div style={{ display: "flex", gap: 6 }}>
              {["Female", "Male", "Other"].map((g) => (
                <button key={g} onClick={() => setCustomerForm((p) => ({ ...p, gender: g }))} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1.5px solid ${customerForm.gender === g ? "#10b981" : "#e2e8f0"}`, background: customerForm.gender === g ? "#f0fdf4" : "#fff", color: customerForm.gender === g ? "#047857" : "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  {g}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <SectionHead label="Contact — Phone is the Unique ID" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <Field label="Phone Number *" full>
            <input
              value={customerForm.phone}
              onChange={(e) => {
                setCustomerForm((p) => ({ ...p, phone: e.target.value }));
                setPhoneError("");
              }}
              placeholder="+231 77 000 0000"
              style={{ width: "100%", padding: "11px 12px", border: `1.5px solid ${phoneError ? "#ef4444" : "#e2e8f0"}`, borderRadius: 9, fontSize: 15, fontFamily: FONT, outline: "none", boxSizing: "border-box", fontWeight: 700 }}
            />
            {phoneError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4, fontWeight: 600 }}>⚠ {phoneError}</div>}
          </Field>
          <Field label="Alt Phone">
            <Input value={customerForm.altPhone} onChange={(e) => setCustomerForm((p) => ({ ...p, altPhone: e.target.value }))} placeholder="+231 88…" />
          </Field>
          <Field label="Alt Contact Name">
            <Input value={customerForm.altName} onChange={(e) => setCustomerForm((p) => ({ ...p, altName: e.target.value }))} placeholder="e.g. daughter, husband" />
          </Field>
        </div>
        <SectionHead label="Location — Community & Landmark" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <Field label="Community / Area">
            <input list="cl" value={customerForm.community} onChange={(e) => setCustomerForm((p) => ({ ...p, community: e.target.value }))} placeholder="Sinkor, Congo Town…" style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            <datalist id="cl">{LR_COMMUNITIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="County">
            <select value={customerForm.county} onChange={(e) => setCustomerForm((p) => ({ ...p, county: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", background: "#fff" }}>
              {LR_COUNTIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Nearest Landmark" full>
            <Input value={customerForm.landmark} onChange={(e) => setCustomerForm((p) => ({ ...p, landmark: e.target.value }))} placeholder="Near Total station, behind mosque, opp. church…" />
          </Field>
        </div>
        <SectionHead label="Medical (optional)" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <Field label="Conditions">
            <Input value={customerForm.conditions} onChange={(e) => setCustomerForm((p) => ({ ...p, conditions: e.target.value }))} placeholder="Diabetes, Hypertension…" />
          </Field>
          <Field label="Allergies ⚠">
            <Input value={customerForm.allergies} onChange={(e) => setCustomerForm((p) => ({ ...p, allergies: e.target.value }))} placeholder="Penicillin, Aspirin…" style={{ borderColor: customerForm.allergies ? "#fde68a" : "#e2e8f0" }} />
          </Field>
          <Field label="Staff Notes" full>
            <textarea value={customerForm.notes} onChange={(e) => setCustomerForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Refill schedule, payment habits, special instructions…" style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", resize: "none", height: 56, boxSizing: "border-box" }} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setNewCustomer(false); setPhoneError(""); }} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Cancel
          </button>
          <button onClick={commitNew} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Register Patient
          </button>
        </div>
      </Modal>
    </div>
  );
}

