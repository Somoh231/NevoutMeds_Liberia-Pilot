import { useMemo, useState } from "react";
import { useAuth } from "@/platform/auth/AuthProvider";
import { useSync } from "@/platform/offline/SyncProvider";
import { fmtDate } from "@/platform/utils/dates";
import { addReminder, buildAllReminders, markReminderSent } from "@/platform/features/reminders/state";
import { whatsappLink } from "@/platform/features/procurement/ReorderDialog";
import { Alert, Badge, Button, Chip, Dialog, EmptyState, FilterBar, FormField, Input, PageHeader, SearchInput, Select, SkeletonBlock, Textarea } from "@/platform/ui";
import { BellRing, CircleCheck, Plus } from "@/platform/ui/icons";

const TODAY = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

function stateOf(r, today) {
  if (r._pendingSync) return "pending";
  if (r.sent) return "done";
  if (r.dueDate < today) return "overdue";
  if (r.dueDate === today) return "today";
  return "upcoming";
}
const STATE = {
  overdue: { label: "Overdue", tone: "danger" },
  today: { label: "Due today", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  pending: { label: "Pending sync", tone: "pending" },
  done: { label: "Reminded", tone: "success" }
};

/**
 * Refill reminders, ordered by what to do next. NevOut Meds does not send
 * messages itself: "Open WhatsApp" prepares the message, and "Mark as reminded"
 * is a separate, explicit step. Delivery is never claimed.
 */
export default function RemindersScreen({ customers, setCustomers, medicines, onShowToast, dataStatus, onCreateReminder, onMarkReminderSent, initialCustomerId }) {
  const { user } = useAuth();
  const { online } = useSync();
  const today = TODAY();
  const [filter, setFilter] = useState("action");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(!!initialCustomerId);
  const [form, setForm] = useState({ customerId: initialCustomerId ?? "", medicine: "", dueDate: "", note: "" });
  const [errors, setErrors] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [saving, setSaving] = useState(false);

  const all = useMemo(() => buildAllReminders(customers).map((r) => ({ ...r, state: stateOf(r, today) })), [customers, today]);
  const counts = all.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {});
  const actionCount = (counts.overdue ?? 0) + (counts.today ?? 0);
  const q = search.trim().toLowerCase();
  const visible = all
    .filter((r) => (filter === "action" ? r.state === "overdue" || r.state === "today" : filter === "all" ? true : r.state === filter))
    .filter((r) => !q || `${r.customer.firstName} ${r.customer.lastName} ${r.medicine}`.toLowerCase().includes(q))
    .sort((a, b) => (a.state === "done" ? 1 : 0) - (b.state === "done" ? 1 : 0) || String(a.dueDate).localeCompare(String(b.dueDate)));

  const message = (r) =>
    `Hello ${r.customer.firstName}, this is ${user?.pharmacy ?? "your pharmacy"}. It’s time to refill your ${r.medicine}. Reply here or stop by — we can have it ready for you.`;

  const markSent = async (r) => {
    if (!r.id) return;
    setBusyId(r.id);
    try {
      await onMarkReminderSent({ reminderId: r.id });
      setCustomers((prev) => markReminderSent(prev, r.customer.id, r.medicine, r.dueDate));
      onShowToast(`${r.customer.firstName} marked as reminded`, "success");
    } catch (e) {
      onShowToast(online ? "Reminder not updated — please try again" : "Marking as reminded needs a connection. Try again when you are back online.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (saving) return;
    const next = {
      customerId: form.customerId ? undefined : "Choose the customer.",
      medicine: form.medicine.trim() ? undefined : "Enter the medicine to refill.",
      dueDate: form.dueDate ? undefined : "Choose the refill date."
    };
    setErrors(next);
    if (next.customerId || next.medicine || next.dueDate) return;
    const customer = customers.find((c) => String(c.id) === String(form.customerId));
    setSaving(true);
    try {
      const outcome = await onCreateReminder({ customerId: customer.id, medicine: form.medicine.trim(), dueDate: form.dueDate, note: form.note });
      const queued = outcome?.status === "queued";
      setCustomers((prev) =>
        addReminder(prev, customer.id, { medicine: form.medicine.trim(), dueDate: form.dueDate, note: form.note, sent: false, ...(queued ? { _pendingSync: true } : {}), ...(outcome?.data ? { id: outcome.data } : {}) })
      );
      onShowToast(queued ? `Reminder for ${customer.firstName} saved on this device — will sync when you are back online` : `Reminder set for ${customer.firstName} on ${fmtDate(form.dueDate)}`, queued ? "info" : "success");
      setAddOpen(false);
      setForm({ customerId: "", medicine: "", dueDate: "", note: "" });
    } catch (err) {
      onShowToast(err?.message || "Reminder not saved — please try again", "error");
    } finally {
      setSaving(false);
    }
  };
  const f = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="nv-page">
      <PageHeader
        title="Refill reminders"
        description={`${actionCount} to send today · ${counts.upcoming ?? 0} upcoming · ${counts.done ?? 0} reminded`}
        actions={<Button variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => { setErrors({}); setAddOpen(true); }}>New reminder</Button>}
      />
      {!online && <Alert tone="offline" className="nv-gap-below">You can open WhatsApp and create reminders offline. Marking a reminder as sent needs a connection.</Alert>}

      <FilterBar search={<SearchInput label="Search reminders" placeholder="Customer or medicine" value={search} onChange={(e) => setSearch(e.target.value)} />}>
        {[
          ["action", `To send`, actionCount],
          ["overdue", "Overdue", counts.overdue ?? 0],
          ["upcoming", "Upcoming", counts.upcoming ?? 0],
          ["pending", "Pending sync", counts.pending ?? 0],
          ["done", "Reminded", counts.done ?? 0],
          ["all", "All", all.length]
        ]
          .filter(([id, , n]) => id === "action" || id === "all" || n > 0)
          .map(([id, label, n]) => (
            <Chip key={id} pressed={filter === id} onClick={() => setFilter(id)}>
              {label} <span className="nv-num">{n}</span>
            </Chip>
          ))}
      </FilterBar>

      {dataStatus?.loading && all.length === 0 ? (
        <div className="nv-card"><SkeletonBlock label="Loading reminders…" lines={4} /></div>
      ) : visible.length === 0 ? (
        <div className="nv-card">
          {filter === "action" ? (
            <EmptyState tone="success" icon={<CircleCheck size={26} />} title="Nothing to send today">
              {counts.upcoming ? `${counts.upcoming} reminder${counts.upcoming === 1 ? " is" : "s are"} coming up.` : "Set a reminder when a customer buys a medicine they take regularly."}
            </EmptyState>
          ) : (
            <EmptyState icon={<BellRing size={26} />} title="No reminders here" />
          )}
        </div>
      ) : (
        <div className="nv-rows" role="list" aria-label="Reminders" style={{ "--cols": "minmax(200px, 2fr) minmax(140px, 1.4fr) 130px 120px auto" }}>
          <div className="nv-rows__head" aria-hidden="true"><span>Customer</span><span>Medicine</span><span>Due</span><span>Status</span><span style={{ textAlign: "right" }}>Actions</span></div>
          {visible.map((r, i) => {
            const st = STATE[r.state];
            const late = r.state === "overdue" ? daysBetween(today, r.dueDate) : 0;
            return (
              <div key={`${r.id ?? i}-${r.dueDate}`} role="listitem" className={`nv-row${r.state === "overdue" ? " nv-row--attention" : ""}`}>
                <div className="nv-row__main" style={{ cursor: "default" }}>
                  <span className="nv-row__title">{r.customer.firstName} {r.customer.lastName}</span>
                  <span className="nv-row__sub">{r.customer.phone}</span>
                </div>
                <div className="nv-row__side"><Badge tone={st.tone}>{st.label}</Badge></div>
                <div className="nv-row__meta">
                  <strong>{r.medicine}</strong> · {r.state === "overdue" ? `${late} day${late === 1 ? "" : "s"} overdue` : r.state === "today" ? "due today" : `due ${fmtDate(r.dueDate)}`}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
                <div className="nv-row__cell">{r.medicine}{r.note && <small>{r.note}</small>}</div>
                <div className="nv-row__cell">{fmtDate(r.dueDate)}{r.state === "overdue" && <small>{late} d overdue</small>}</div>
                <div className="nv-row__cell"><Badge tone={st.tone}>{st.label}</Badge></div>
                <div className="nv-row__actions">
                  {r.state !== "done" && r.state !== "pending" && (
                    <>
                      <a className="nv-btn nv-btn--sm" href={whatsappLink(r.customer.phone, message(r))} target="_blank" rel="noreferrer" aria-label={`Open WhatsApp to remind ${r.customer.firstName}`}>
                        Open WhatsApp
                      </a>
                      <Button size="sm" variant={r.state === "upcoming" ? "ghost" : "primary"} loading={busyId === r.id} disabled={!online || !r.id} onClick={() => markSent(r)} aria-label={`Mark ${r.customer.firstName}’s ${r.medicine} reminder as sent`}>
                        Mark as reminded
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="nv-hint" style={{ marginTop: 12 }}>
        NevOut Meds doesn’t send messages itself, so it can’t tell whether a WhatsApp message was delivered. Mark a reminder once you have sent it.
      </p>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="New refill reminder" width={520}>
        <form className="nv-stack" onSubmit={create} noValidate>
          <FormField label="Customer" required error={errors.customerId}>
            <Select {...f("customerId")}>
              <option value="">Choose a customer</option>
              {[...customers].sort((a, b) => a.firstName.localeCompare(b.firstName)).map((c) => (
                <option key={c.id} value={c.id} disabled={!!c._pendingSync}>{c.firstName} {c.lastName} · {c.phone}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Medicine" required error={errors.medicine}>
            <Input list="reminder-medicines" {...f("medicine")} />
          </FormField>
          <datalist id="reminder-medicines">{medicines.map((m) => <option key={m.id} value={m.name} />)}</datalist>
          <FormField label="Refill date" required error={errors.dueDate}>
            <Input type="date" min={today} {...f("dueDate")} />
          </FormField>
          <FormField label="Note"><Textarea {...f("note")} style={{ minHeight: 64 }} /></FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Save reminder</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
