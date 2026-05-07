const WEEK_MS = 7 * 86400000;

export function buildAllReminders(customers: any[]) {
  return customers
    .flatMap((c) => c.reminders.map((r: any) => ({ ...r, customer: c })))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

export function splitReminderBuckets(allReminders: any[], nowMs = Date.now()) {
  const cutoff = new Date(nowMs + WEEK_MS);
  const due = allReminders.filter((r) => !r.sent && new Date(r.dueDate) <= cutoff);
  const upcoming = allReminders.filter((r) => !r.sent && new Date(r.dueDate) > cutoff);
  const sent = allReminders.filter((r) => r.sent);
  return { due, upcoming, sent };
}

export function markReminderSent(customers: any[], customerId: number, medicine: string, dueDate: string) {
  return customers.map((cu) =>
    cu.id === customerId
      ? { ...cu, reminders: cu.reminders.map((re: any) => (re.medicine === medicine && re.dueDate === dueDate ? { ...re, sent: true } : re)) }
      : cu
  );
}

export function markDueRemindersSent(customers: any[], due: any[]) {
  return customers.map((c) => ({
    ...c,
    reminders: c.reminders.map((r: any) =>
      due.some((d) => d.customer.id === c.id && d.medicine === r.medicine) ? { ...r, sent: true } : r
    )
  }));
}

export function addReminder(customers: any[], customerId: number, reminder: { medicine: string; dueDate: string; note: string; sent: boolean }) {
  return customers.map((c) => (c.id === customerId ? { ...c, reminders: [...c.reminders, reminder] } : c));
}

