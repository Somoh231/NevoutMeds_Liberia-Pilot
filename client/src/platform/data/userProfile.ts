import type { UserProfileRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export async function fetchUserProfile(userId: UUID): Promise<UserProfileRow | null> {
  const db = getSupabaseDb();
  const { data, error } = await db.from("users_profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as UserProfileRow | null;
}

