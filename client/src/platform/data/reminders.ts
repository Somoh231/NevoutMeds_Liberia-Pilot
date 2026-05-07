import type { ReminderRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export async function fetchReminders(args: { pharmacyId: UUID }) {
  const db = getSupabaseDb();
  const { data, error } = await db.from("reminders").select("*").eq("pharmacy_id", args.pharmacyId).order("due_date", { ascending: true }).limit(2000);
  if (error) throw error;
  return (data ?? []) as unknown as ReminderRow[];
}

export async function createReminder(args: { pharmacyId: UUID; customerId: UUID; medicine: string; dueDate: string; note: string | null }) {
  const db = getSupabaseDb();
  const { error } = await db.from("reminders").insert({
    pharmacy_id: args.pharmacyId,
    customer_id: args.customerId,
    medicine: args.medicine,
    due_date: args.dueDate,
    sent: false,
    note: args.note
  });
  if (error) throw error;
}

export async function markReminderSentDb(args: { pharmacyId: UUID; reminderId: UUID }) {
  const db = getSupabaseDb();
  const { error } = await db.from("reminders").update({ sent: true, sent_at: new Date().toISOString() }).eq("pharmacy_id", args.pharmacyId).eq("id", args.reminderId);
  if (error) throw error;
}

