export function logError(error: unknown, context?: Record<string, unknown>) {
  // Phase 6: simple hook point for Sentry/Datadog later.
  // eslint-disable-next-line no-console
  console.error("[NevOutMeds]", error, context ?? {});
}

export async function logErrorToDb(args: { pharmacyId?: string | null; userId?: string | null; message: string; context?: Record<string, unknown> }) {
  try {
    const { getSupabaseClient } = await import("@/platform/supabaseClient");
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from("app_logs").insert({
      pharmacy_id: args.pharmacyId ?? null,
      user_id: args.userId ?? null,
      level: "error",
      message: args.message,
      context: args.context ?? {}
    });
  } catch {
    // best-effort only
  }
}

