import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { CUSTOMERS_SEED } from "@/platform/seed/customers";
import { MEDICINES } from "@/platform/seed/medicines";
import { getStockStatus, NEEDS_ATTENTION } from "@/platform/utils/inventoryStatus";
import { useInventoryMedicines } from "@/platform/data/useInventoryMedicines";
import { useAdjustStock } from "@/platform/data/useAdjustStock";
import { useCustomers } from "@/platform/data/useCustomers";
import { useRecordPurchase } from "@/platform/data/useRecordPurchase";
import { useCreateProduct } from "@/platform/data/useCreateProduct";
import { useCreateCustomer } from "@/platform/data/useCreateCustomer";
import { useReminders } from "@/platform/data/useReminders";
import { useCreateReminder } from "@/platform/data/useCreateReminder";
import { useMarkReminderSent } from "@/platform/data/useMarkReminderSent";
import DashboardScreen from "@/platform/features/dashboard/DashboardScreen";
// Owner-only screens are split out of the main bundle: day-to-day staff never
// open them, and this keeps first load small on low-end phones.
const StaffScreen = lazy(() => import("@/platform/features/staff/StaffScreen"));
const FinancialsScreen = lazy(() => import("@/platform/features/financials/FinancialsScreen"));
const AnalyticsScreen = lazy(() => import("@/platform/features/analytics/AnalyticsScreen"));
const DocumentsScreen = lazy(() => import("@/platform/features/documents/DocumentsScreen"));
const InventoryScreen = lazy(() => import("@/platform/features/inventory/InventoryScreen"));
const CustomersScreen = lazy(() => import("@/platform/features/customers/CustomersScreen"));
const SuppliersScreen = lazy(() => import("@/platform/features/suppliers/SuppliersScreen"));
const RemindersScreen = lazy(() => import("@/platform/features/reminders/RemindersScreen"));
const SalesScreen = lazy(() => import("@/platform/features/sales/SalesScreen"));
const ExpiryScreen = lazy(() => import("@/platform/features/expiry/ExpiryScreen"));
const ReportsScreen = lazy(() => import("@/platform/features/reports/ReportsScreen"));
const SettingsScreen = lazy(() => import("@/platform/features/settings/SettingsScreen"));
import AppShell from "@/platform/shell/AppShell";
import { OWNER_ONLY_SCREENS } from "@/platform/shell/navigation";
import { EmptyState, SkeletonBlock, Toast } from "@/platform/ui";
import { Lock } from "@/platform/ui/icons";
import { trackEvent } from "@/platform/reliability/telemetry";
import { useAuth } from "@/platform/auth/AuthProvider";
import { loadDemoCustomers, loadDemoMedicines, saveDemoCustomers, saveDemoMedicines } from "@/platform/demo/storage";
import { tenantToday } from "@/platform/country/tenant";

// ═══════════════════════════════════════════════════════════
// ROOT APP — Complete Platform v3
// All 9 screens · Role-based · Full navigation
// ═══════════════════════════════════════════════════════════
export default function NevoutmedsApp({ user, onLogout, onOpenHelp }) {
  const { configured } = useAuth();
  const [screen, setScreen] = useState("dashboard");
  // Optional context for the destination (e.g. a pre-selected filter), set by
  // briefing actions and cleared by plain navigation.
  const [navParams, setNavParams] = useState({});
  const navigate = (id, params = {}) => {
    setNavParams(params);
    setScreen(id);
    window.scrollTo({ top: 0 });
  };
  // Seed fixtures are demo-only. A configured (real) workspace starts empty and
  // fills from Supabase, so nobody ever sees invented stock or customers.
  const [medicines, setMedicines] = useState(configured ? [] : MEDICINES);
  const [customers, setCustomers] = useState(configured ? [] : CUSTOMERS_SEED);
  const [toast, setToast] = useState(null);
  const inventoryQ = useInventoryMedicines();
  const customersQ = useCustomers();
  const remindersQ = useReminders();
  const adjustStockM = useAdjustStock();
  const recordPurchaseM = useRecordPurchase();
  const createProductM = useCreateProduct();
  const createCustomerM = useCreateCustomer();
  const createReminderM = useCreateReminder();
  const markReminderSentM = useMarkReminderSent();

  useEffect(() => {
    if (inventoryQ.data && Array.isArray(inventoryQ.data)) {
      setMedicines(inventoryQ.data);
    }
  }, [inventoryQ.data]);

  useEffect(() => {
    if (customersQ.data && Array.isArray(customersQ.data)) {
      setCustomers(customersQ.data);
    }
  }, [customersQ.data]);

  // Demo Mode: hydrate from localStorage once.
  useEffect(() => {
    if (configured) return;
    const m = loadDemoMedicines();
    const c = loadDemoCustomers();
    if (m && Array.isArray(m)) setMedicines(m);
    if (c && Array.isArray(c)) setCustomers(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // Demo Mode: persist key state locally (survives refresh).
  useEffect(() => {
    if (configured) return;
    saveDemoMedicines(medicines);
  }, [configured, medicines]);

  useEffect(() => {
    if (configured) return;
    saveDemoCustomers(customers);
  }, [configured, customers]);

  // Customers with their reminders, derived rather than written back into
  // state: the old effect ran only when reminders loaded, so any later
  // customer refresh silently wiped every reminder (the dashboard always
  // showed 0 due). Local additions not yet on the server are kept.
  const customersView = useMemo(() => {
    if (!remindersQ.data || !Array.isArray(remindersQ.data)) return customers;
    const byCustomer = {};
    for (const r of remindersQ.data) (byCustomer[String(r.customer_id)] ??= []).push({ id: r.id, medicine: r.medicine, dueDate: r.due_date, sent: !!r.sent, note: r.note || "" });
    return customers.map((c) => {
      const server = byCustomer[String(c.id)] ?? [];
      const local = c.reminders ?? [];
      const merged = server.map((r) => (local.some((l) => l.id === r.id && l.sent) ? { ...r, sent: true } : r));
      const localOnly = local.filter((l) => (!l.id || l._pendingSync) && !server.some((r) => r.medicine === l.medicine && r.dueDate === l.dueDate));
      return { ...c, reminders: [...merged, ...localOnly] };
    });
  }, [customers, remindersQ.data]);

  useEffect(() => {
    if (!user?.pharmacyId) return;
    trackEvent({ pharmacyId: user.pharmacyId, userId: String(user.id), eventName: "module_view", module: screen, metadata: {} });
  }, [screen, user?.pharmacyId, user?.id]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  // Auth is handled at the route level (`/login` + protected `/platform`).

  // "Nothing loaded yet" must never look like "nothing wrong": an empty list
  // while the first fetch is in flight would read as "all stock healthy".
  const statusOf = (q) => (!configured || q.data ? "ready" : q.isError ? "error" : "loading");
  const dataStatus = { inventory: statusOf(inventoryQ), customers: statusOf(customersQ) };

  // Same rule as Inventory's "Needs attention" (out, critical, expiring, low).
  const alerts = medicines.map((m) => ({ ...m, status: getStockStatus(m) })).filter((m) => NEEDS_ATTENTION.includes(m.status));
  const today = tenantToday();
  const dueReminders = customersView.filter((c) => c.reminders.some((r) => !r.sent && r.dueDate <= today));

  const isOwner = user.role === "owner" || user.role === "admin";

  // One stock-adjustment path for Inventory and Expiry (adjust_stock_idempotent).
  const adjustStock = async ({ productId, productName, delta, note }) => {
              const res = await adjustStockM.mutateAsync({ productId, productName, delta, note });
              if (res?.status === "queued") {
                setMedicines((prev) =>
                  prev.map((m) => (String(m.id) === String(productId) ? { ...m, pendingSync: true } : m))
                );
              }
              return res;
            };

  // One sale path for the Sales screen and a customer's "Sale" action
  // (record_purchase_idempotent; semantics unchanged).
  const recordPurchase = async ({ customerId, customerName, method, items }) => {
              // Demo Mode: record locally (and reduce stock) with no Supabase required.
              if (!configured) {
                const first = items?.[0];
                if (first?.productId && first?.qty) {
                  setMedicines((prev) =>
                    prev.map((m) =>
                      String(m.id) === String(first.productId)
                        ? { ...m, stock: Math.max(0, Number(m.stock || 0) - Number(first.qty || 0)) }
                        : m
                    )
                  );
                }
                return;
              }
              const res = await recordPurchaseM.mutateAsync({ customerId, method, items, customerName });
              if (res?.status === "queued") {
                // The sale is saved on this device only. Reflect it in the shelf
                // count immediately, otherwise staff would keep selling against a
                // stock figure they have already sold down.
                setMedicines((prev) =>
                  prev.map((m) => {
                    const line = (items ?? []).find((i) => String(i.productId) === String(m.id));
                    return line
                      ? { ...m, stock: Math.max(0, Number(m.stock || 0) - Number(line.qty || 0)), pendingSync: true }
                      : m;
                  })
                );
              }
              return res;
  };


  return (
    <AppShell
      user={user}
      screen={screen}
      onNavigate={(id) => navigate(id)}
      badges={{ inventory: alerts.length, reminders: dueReminders.length }}
      onSignOut={() => onLogout?.()}
      onOpenHelp={() => onOpenHelp?.()}
    >
      {/* Screens keep their own layout until they are redesigned; .nv-screen
          lets the shell own the page padding meanwhile. */}
      <div className="nv-screen" key={`${screen}:${JSON.stringify(navParams)}`}>
        <Suspense fallback={<div style={{ padding: "var(--nv-page-pad)" }}><SkeletonBlock label="Loading…" lines={4} /></div>}>
        {screen === "dashboard" && <DashboardScreen user={user} medicines={medicines} customers={customersView} dataStatus={dataStatus} onNavigate={navigate} onShowToast={showToast} />}
        {screen === "inventory" && (
          <InventoryScreen
            onNavigate={navigate}
            initialFilter={navParams.filter}
            medicines={medicines}
            setMedicines={setMedicines}
            onShowToast={showToast}
            onAdjustStock={adjustStock}
            onCreateProduct={async (args) => {
              if (!configured) return undefined;
              // Return the saved id so the list shows the real product row.
              return await createProductM.mutateAsync(args);
            }}
            dataStatus={{ loading: inventoryQ.isFetching, error: !!inventoryQ.error, firstLoad: dataStatus.inventory === "loading" }}
          />
        )}
        {screen === "expiry" && (
          <ExpiryScreen medicines={medicines} setMedicines={setMedicines} onAdjustStock={adjustStock} onShowToast={showToast} onNavigate={navigate} dataStatus={{ firstLoad: dataStatus.inventory === "loading" }} />
        )}
        {screen === "sales" && (
          <SalesScreen customers={customersView} setCustomers={setCustomers} medicines={medicines} onRecordPurchase={recordPurchase} onShowToast={showToast} onNavigate={navigate} />
        )}
        {screen === "customers" && (
          <CustomersScreen
            onNavigate={navigate}
            initialRegister={!!navParams.register}
            customers={customersView}
            setCustomers={setCustomers}
            medicines={medicines}
            onShowToast={showToast}
            dataStatus={{ loading: customersQ.isFetching, error: !!customersQ.error, firstLoad: dataStatus.customers === "loading" }}
            onCreateCustomer={
              configured
                ? async (args) => {
                    const res = await createCustomerM.mutateAsync(args);
                    if (res?.status === "queued") {
                      // Saved on this device only — shown as pending, not as a
                      // confirmed customer record.
                      return {
                        id: `pending-${res.idempotencyKey}`,
                        phone: args.phone,
                        firstName: args.firstName,
                        lastName: args.lastName,
                        community: args.community ?? "",
                        county: args.county,
                        totalSpend: 0,
                        visitCount: 0,
                        lastVisit: tenantToday(),
                        creditBalance: 0,
                        creditLimit: args.creditLimit ?? 0,
                        conditions: args.conditions ?? [],
                        allergies: args.allergies ?? [],
                        reminders: [],
                        purchases: [],
                        _pendingSync: true
                      };
                    }
                    return undefined;
                  }
                : undefined
            }
            onRecordPurchase={recordPurchase}
          />
        )}
        {screen === "suppliers" && <SuppliersScreen medicines={medicines} onShowToast={showToast} onNavigate={navigate} compareProductId={navParams.compareProductId} initialTab={navParams.tab} />}
        {screen === "reminders" && (
          <RemindersScreen
            initialCustomerId={navParams.customerId}
            customers={customersView}
            setCustomers={setCustomers}
            medicines={medicines}
            onShowToast={showToast}
            dataStatus={{ loading: remindersQ.isFetching, error: !!remindersQ.error }}
            onCreateReminder={({ customerId, medicine, dueDate, note }) => createReminderM.mutateAsync({ customerId, medicine, dueDate, note })}
            onMarkReminderSent={({ reminderId }) => markReminderSentM.mutateAsync({ reminderId })}
          />
        )}
        {isOwner && OWNER_ONLY_SCREENS.includes(screen) && (
          <Suspense fallback={<div style={{ padding: "var(--nv-page-pad)" }}><SkeletonBlock label="Loading…" lines={4} /></div>}>
            {screen === "staff" && <StaffScreen onShowToast={showToast} />}
            {screen === "financials" && <FinancialsScreen customers={customersView} medicines={medicines} onNavigate={navigate} />}
            {screen === "reports" && <ReportsScreen medicines={medicines} customers={customersView} onNavigate={navigate} />}
            {screen === "analytics" && <AnalyticsScreen medicines={medicines} customers={customersView} onNavigate={navigate} />}
            {screen === "documents" && <DocumentsScreen onShowToast={showToast} />}
            {screen === "settings" && <SettingsScreen onShowToast={showToast} />}
          </Suspense>
        )}
        {OWNER_ONLY_SCREENS.includes(screen) && !isOwner && (
          <div className="nv-restricted">
            <EmptyState icon={<Lock size={26} />} title="Only the pharmacy owner can open this">
              Ask your pharmacy owner if you need access.
            </EmptyState>
          </div>
        )}
        </Suspense>
      </div>
      <Toast toast={toast} />
    </AppShell>
  );
}

