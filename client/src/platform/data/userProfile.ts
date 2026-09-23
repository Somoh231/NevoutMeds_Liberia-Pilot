import type { UserProfileRow, UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";
import { resolveTenantConfig, type ResolvedTenantConfig } from "@/platform/country/tenant";

export async function fetchUserProfile(userId: UUID): Promise<UserProfileRow | null> {
  const db = getSupabaseDb();
  const { data, error } = await db.from("users_profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as UserProfileRow | null;
}


/**
 * The tenant's own pharmacy: display name and country configuration. RLS only
 * returns the caller's pharmacy. `select("*")` keeps this working against a
 * database that predates the Phase 9 columns (the config then resolves to the
 * Liberia defaults, which is how those pharmacies have always behaved).
 */
export async function fetchPharmacy(pharmacyId: UUID): Promise<{ name: string | null; config: ResolvedTenantConfig }> {
  const db = getSupabaseDb();
  const { data, error } = await db.from("pharmacies").select("*").eq("id", pharmacyId).maybeSingle();
  if (error) throw error;
  const row = (data ?? null) as ({ name?: string } & Parameters<typeof resolveTenantConfig>[0]) | null;
  return { name: row?.name || null, config: resolveTenantConfig(row) };
}
