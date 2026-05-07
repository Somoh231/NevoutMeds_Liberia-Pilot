import { getSupabaseClient } from "@/platform/supabaseClient";

export function getSupabaseDb() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

