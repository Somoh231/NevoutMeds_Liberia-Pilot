import { useState } from "react";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { Avatar, Modal } from "@/platform/components/primitives";
import { addReminder, buildAllReminders, markDueRemindersSent, markReminderSent, splitReminderBuckets } from "@/platform/features/reminders/state";

export default function RemindersScreen({ customers, setCustomers, medicines, onShowToast, dataStatus, onCreateReminder, onMarkReminderSent }) {
  const [addModal, setAddModal] = useState(null);
  const [form, setForm] = useState({ medicine: "", dueDate: "", note: "" });

  const allReminders = buildAllReminders(customers);
  const { due, upcoming, sent } = splitReminderBuckets(allReminders);

  const sendReminder = async (c, r) => {
    if (typeof onMarkReminderSent === "function" && r.id) {
      try {
        await onMarkReminderSent({ reminderId: r.id });
        setCustomers((prev) => markReminderSent(prev, c.id, r.medicine, r.dueDate));
        onShowToast(`Reminder sent to ${c.firstName} via WhatsApp ✓`, "success");
      } catch (e) {
        onShowToast("Failed to mark reminder sent", "info");
      }
      return;
    }
    setCustomers((prev) => markReminderSent(prev, c.id, r.medicine, r.dueDate));
    onShowToast(`Reminder sent to ${c.firstName} via WhatsApp ✓`, "success");
  };

  const sendAll = async () => {
    if (typeof onMarkReminderSent === "function") {
      try {
        for (const r of due) {
          if (r.id) await onMarkReminderSent({ reminderId: r.id });
        }
        setCustomers((prev) => markDueRemindersSent(prev, due));
        onShowToast(`${due.length} reminders sent via WhatsApp ✓`, "success");
      } catch (e) {
        onShowToast("Failed to send all reminders", "info");
      }
      return;
    }
    setCustomers((prev) => markDueRemindersSent(prev, due));
    onShowToast(`${due.length} reminders sent via WhatsApp ✓`, "success");
  };

  const addOne = async () => {
    if (!addModal || !form.medicine || !form.dueDate) return;
    if (typeof onCreateReminder === "function") {
      try {
        await onCreateReminder({ customerId: addModal.id, medicine: form.medicine, dueDate: form.dueDate, note: form.note });
        setCustomers((prev) => addReminder(prev, addModal.id, { medicine: form.medicine, dueDate: form.dueDate, note: form.note, sent: false }));
        onShowToast(`Reminder set for ${addModal.firstName}`, "success");
        setAddModal(null);
        setForm({ medicine: "", dueDate: "", note: "" });
      } catch (e) {
        onShowToast("Failed to create reminder", "info");
      }
      return;
    }

    setCustomers((prev) => addReminder(prev, addModal.id, { medicine: form.medicine, dueDate: form.dueDate, note: form.note, sent: false }));
    onShowToast(`Reminder set for ${addModal.firstName}`, "success");
    setAddModal(null);
    setForm({ medicine: "", dueDate: "", note: "" });
  };

  const ReminderCard = ({ r, showSend = true }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f8fafc" }}>
      <Avatar name={`${r.customer.firstName} ${r.customer.lastName}`} size={36} bg={`hsl(${r.customer.id * 60},60%,50%)`} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: SLATE }}>
          {r.customer.firstName} {r.customer.lastName}
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {r.medicine} · Due {r.dueDate}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>📞 {r.customer.phone}</div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {r.sent ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: "#f0fdf4", padding: "3px 8px", borderRadius: 99 }}>✓ Sent</span>
        ) : (
          showSend && (
            <button onClick={() => sendReminder(r.customer, r)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              Send WhatsApp
            </button>
          )
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Prescription Reminders</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span>Proactive refill alerts keep patients returning</span>
            {dataStatus?.loading && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>Syncing…</span>}
            {dataStatus?.error && <span style={{ fontSize: 12, color: "#f97316", fontWeight: 800 }}>Using cached data</span>}
          </div>
        </div>
        {due.length > 0 && (
          <button onClick={sendAll} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
            📲 Send All {due.length} Due Now
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        {[{ l: "Due This Week", v: due.length, c: "#f59e0b", bg: "#fffbeb" }, { l: "Upcoming", v: upcoming.length, c: "#3b82f6", bg: "#eff6ff" }, { l: "Sent", v: sent.length, c: GREEN, bg: "#f0fdf4" }].map((s, i) => (
          <div key={i} style={{ background: s.bg, borderRadius: 13, padding: "16px 18px", border: `1px solid ${s.c}30` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.c, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {due.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #fde68a", padding: "18px 22px", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#78350f", marginBottom: 12 }}>🔔 Due This Week — {due.length} patients</div>
          {due.map((r, i) => (
            <ReminderCard key={i} r={r} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "18px 22px", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>📅 Upcoming Reminders</div>
          {upcoming.map((r, i) => (
            <ReminderCard key={i} r={r} showSend={false} />
          ))}
        </div>
      )}

      <div style={{ background: "#f8fafc", borderRadius: 14, border: "1px solid #e2e8f0", padding: "18px 22px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Add Reminder for a Patient</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {customers.map((c) => (
            <button key={c.id} onClick={() => setAddModal(c)} style={{ padding: "8px 14px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", gap: 7 }}>
              <Avatar name={`${c.firstName} ${c.lastName}`} size={20} bg={`hsl(${c.id * 60},60%,50%)`} />
              {c.firstName} {c.lastName}
            </button>
          ))}
        </div>
      </div>

      <Modal open={!!addModal} onClose={() => setAddModal(null)}>
        {addModal && (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Set Reminder</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 18 }}>
              {addModal.firstName} {addModal.lastName} · {addModal.phone}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Medicine</label>
              <select value={form.medicine} onChange={(e) => setForm((p) => ({ ...p, medicine: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", background: "#fff" }}>
                <option value="">Select…</option>
                {medicines.map((m) => (
                  <option key={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Reminder Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>WhatsApp Message (optional)</label>
              <textarea value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder={`Hi ${addModal.firstName}, your refill is due soon. Come in anytime — we have it in stock.`} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 9, fontSize: 13, fontFamily: FONT, outline: "none", resize: "none", height: 64, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setAddModal(null)} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Cancel
              </button>
              <button onClick={addOne} style={{ flex: 2, padding: "11px", borderRadius: 9, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                Set Reminder
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

