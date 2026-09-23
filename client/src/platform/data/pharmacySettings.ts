import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

/** The pharmacy row as Settings edits it (Phase 9 columns may be absent on old servers). */
export type PharmacySettingsRow = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  country_code?: string;
  default_currency?: string;
  timezone?: string;
  locale?: string;
  payment_methods?: string[] | null;
  address_fields?: Record<string, string>;
  regulatory?: Record<string, string>;
};

export type ConfigChange = { id: number; field: string; old_value: unknown; new_value: unknown; changed_at: string };

export function usePharmacySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pharmacySettings", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () => {
      const db = getSupabaseDb();
      const { data, error } = await db.from("pharmacies").select("*").eq("id", user!.pharmacyId!).maybeSingle();
      if (error) throw error;
      const row = data as PharmacySettingsRow | null;
      // Whether country and currency are still changeable (server-decided).
      let locked: boolean | null = null;
      if (row?.country_code) {
        const ctx = await db.rpc("pharmacy_country_context");
        if (!ctx.error) locked = Boolean((ctx.data as { country_locked?: boolean } | null)?.country_locked);
      }
      return { row, locked };
    }
  });
}

export function useConfigChanges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pharmacyConfigChanges", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () => {
      const db = getSupabaseDb();
      const { data, error } = await db
        .from("pharmacy_config_changes")
        .select("id,field,old_value,new_value,changed_at")
        .eq("pharmacy_id", user!.pharmacyId!)
        .order("changed_at", { ascending: false })
        .limit(12);
      // Older servers don't have the audit table; Settings simply hides the list.
      if (error) return [] as ConfigChange[];
      return (data ?? []) as ConfigChange[];
    }
  });
}

/**
 * Owner-only, online-only. The server validates every value against its
 * country registry and refuses country/currency changes after the first sale;
 * the new configuration is then re-read so money and dates update everywhere.
 */
export function useUpdatePharmacySettings() {
  const qc = useQueryClient();
  const { user, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (changes: Record<string, unknown>) => {
      const db = getSupabaseDb();
      const { data, error } = await db.rpc("update_pharmacy_settings", { p_changes: changes });
      if (error) throw error;
      return data as PharmacySettingsRow;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pharmacySettings", user?.pharmacyId] }),
        qc.invalidateQueries({ queryKey: ["pharmacyConfigChanges", user?.pharmacyId] }),
        refreshProfile()
      ]);
      // Server reports use the new timezone/currency.
      void qc.invalidateQueries({ queryKey: ["financialSummary", user?.pharmacyId] });
      void qc.invalidateQueries({ queryKey: ["dashboardKpis", user?.pharmacyId] });
    }
  });
}

/** Plain-language version of a settings error. */
export function friendlySettingsError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const msg = e?.message ?? "";
  if (e?.code === "55000" || /locked/.test(msg)) {
    return "Country and currency can’t change once sales are recorded, so past amounts keep the currency they were entered in.";
  }
  if (e?.code === "42501" || /forbidden/.test(msg)) return "Only the pharmacy owner can change settings.";
  if (/not supported|not available|at least one/.test(msg)) return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Settings need a connection. Nothing was changed.";
  return "Settings weren’t saved. Try again.";
}
