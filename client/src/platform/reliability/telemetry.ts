import { getSupabaseClient } from "@/platform/supabaseClient";

type TelemetryEvent = {
  pharmacyId: string;
  userId: string;
  eventName: string;
  module?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
};

export async function trackEvent(evt: TelemetryEvent) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.from("app_events").insert({
      pharmacy_id: evt.pharmacyId,
      user_id: evt.userId,
      event_name: evt.eventName,
      module: evt.module ?? null,
      path: evt.path ?? null,
      metadata: evt.metadata ?? {}
    });
  } catch {
    // best-effort only
  }
}

export async function submitFeedback(args: {
  pharmacyId: string;
  userId: string;
  kind: "issue" | "feature" | "rating";
  rating?: number | null;
  title?: string | null;
  message?: string | null;
  page?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase not configured");

  const { error } = await supabase.from("app_feedback").insert({
    pharmacy_id: args.pharmacyId,
    user_id: args.userId,
    kind: args.kind,
    rating: args.rating ?? null,
    title: args.title ?? null,
    message: args.message ?? null,
    page: args.page ?? null,
    metadata: args.metadata ?? {}
  });
  if (error) throw error;
}

