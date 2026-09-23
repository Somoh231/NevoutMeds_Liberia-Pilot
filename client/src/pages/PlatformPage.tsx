import { useLocation } from "react-router-dom";
import { useMemo, useState, type FormEvent } from "react";
import NevoutmedsApp from "./NevoutmedsApp";
import { useAuth } from "@/platform/auth/AuthProvider";
import { submitFeedback } from "@/platform/reliability/telemetry";
import { useRealtimeSync } from "@/platform/realtime/useRealtimeSync";
import { Button, Chip, Dialog, FormField, Input, Tabs, Textarea, Toast, tabPanelProps, type ToastMessage } from "@/platform/ui";

type FeedbackTab = "issue" | "feature" | "rating";

export default function PlatformPage() {
  const { user, signOut } = useAuth();
  // Same-pharmacy live updates for the operational tables.
  useRealtimeSync();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <NevoutmedsApp user={user} onLogout={signOut} onOpenHelp={() => setHelpOpen(true)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const loc = useLocation();
  const [tab, setTab] = useState<FeedbackTab>("issue");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; message?: string }>({});
  const [toast, setToast] = useState<ToastMessage>(null);

  const supportWhatsappHref = useMemo(() => {
    const text = encodeURIComponent(`Hi NevOut Meds support — I need help with the pilot.\nPage: ${loc.pathname}\nPharmacy: ${user?.pharmacy ?? ""}`);
    return `https://wa.me/?text=${text}`;
  }, [loc.pathname, user?.pharmacy]);

  const flash = (t: ToastMessage) => {
    setToast(t);
    setTimeout(() => setToast(null), 3200);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !user) return;
    if (!user.pharmacyId) return flash({ msg: "Finish setting up your pharmacy first.", type: "warning" });
    if (tab !== "rating") {
      const next = { title: title.trim() ? undefined : "Add a short summary.", message: message.trim() ? undefined : "Tell us what happened." };
      setErrors(next);
      if (next.title || next.message) return;
    }
    setBusy(true);
    try {
      if (tab === "rating") {
        await submitFeedback({ pharmacyId: user.pharmacyId, userId: String(user.id), kind: "rating", rating, page: loc.pathname });
      } else {
        await submitFeedback({ pharmacyId: user.pharmacyId, userId: String(user.id), kind: tab, title: title.trim(), message: message.trim(), page: loc.pathname });
      }
      flash({ msg: "Thanks — feedback received.", type: "success" });
      setTitle("");
      setMessage("");
      onClose();
    } catch (err: any) {
      flash({ msg: err?.message || "Could not send feedback. Try again.", type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Help & feedback"
        description="Tell us what is not working or what would help. The pilot team reads every message."
        width={600}
      >
        <form onSubmit={submit} style={{ display: "grid", gap: 16 }} noValidate>
          <Tabs
            idBase="feedback"
            label="Feedback type"
            block
            value={tab}
            onChange={(t) => { setTab(t); setErrors({}); }}
            tabs={[
              { id: "issue", label: "Report issue" },
              { id: "feature", label: "Request feature" },
              { id: "rating", label: "Quick rating" }
            ]}
          />
          <div {...tabPanelProps("feedback", tab)} style={{ display: "grid", gap: 16, outline: "none" }}>
            {tab !== "rating" ? (
              <>
                <FormField label="Summary" required error={errors.title}>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sale did not save" />
                </FormField>
                <FormField label="Details" required error={errors.message} hint="What happened, and what did you expect?">
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
                </FormField>
              </>
            ) : (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="nv-label" style={{ marginBottom: 10 }}>How satisfied are you today?</legend>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Chip key={n} pressed={rating === n} onClick={() => setRating(n)} style={{ minWidth: 48, minHeight: 44, justifyContent: "center" }} aria-label={`${n} out of 5`}>
                      {n}
                    </Chip>
                  ))}
                </div>
                <p className="nv-hint" style={{ marginTop: 8 }}>1 = not usable · 5 = excellent</p>
              </fieldset>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button type="submit" variant="primary" loading={busy}>Send</Button>
            <a className="nv-btn" href={supportWhatsappHref} target="_blank" rel="noreferrer">WhatsApp support</a>
            <a className="nv-btn nv-btn--ghost" href="mailto:support@nevoutmeds.com">Email support</a>
          </div>
        </form>
      </Dialog>
      <Toast toast={toast} />
    </>
  );
}
