import { useEffect, useState } from "react";
import { DARK, FONT, GREEN } from "@/platform/constants";
import { CUSTOMERS_SEED } from "@/platform/seed/customers";
import { MEDICINES } from "@/platform/seed/medicines";
import { getStockStatus } from "@/platform/utils/inventoryStatus";
import { useInventoryMedicines } from "@/platform/data/useInventoryMedicines";
import { useAdjustStock } from "@/platform/data/useAdjustStock";
import { useCustomers } from "@/platform/data/useCustomers";
import { useRecordPurchase } from "@/platform/data/useRecordPurchase";
import { useCreateProduct } from "@/platform/data/useCreateProduct";
import { useReminders } from "@/platform/data/useReminders";
import { useCreateReminder } from "@/platform/data/useCreateReminder";
import { useMarkReminderSent } from "@/platform/data/useMarkReminderSent";
import DashboardScreen from "@/platform/features/dashboard/DashboardScreen";
import InventoryScreen from "@/platform/features/inventory/InventoryScreen";
import CustomersScreen from "@/platform/features/customers/CustomersScreen";
import SuppliersScreen from "@/platform/features/suppliers/SuppliersScreen";
import RemindersScreen from "@/platform/features/reminders/RemindersScreen";
import StaffScreen from "@/platform/features/staff/StaffScreen";
import FinancialsScreen from "@/platform/features/financials/FinancialsScreen";
import AnalyticsScreen from "@/platform/features/analytics/AnalyticsScreen";
import DocumentsScreen from "@/platform/features/documents/DocumentsScreen";
import { Avatar, Toast } from "@/platform/components/primitives";
import BrandLogo from "@/components/BrandLogo";
import { trackEvent } from "@/platform/reliability/telemetry";
import { useAuth } from "@/platform/auth/AuthProvider";
import { loadDemoCustomers, loadDemoMedicines, saveDemoCustomers, saveDemoMedicines } from "@/platform/demo/storage";

// ═══════════════════════════════════════════════════════════
// ROOT APP — Complete Platform v3
// All 9 screens · Role-based · Full navigation
// ═══════════════════════════════════════════════════════════
export default function NevoutmedsApp({ user, onLogout }) {
  const { configured } = useAuth();
  const [screen, setScreen] = useState("dashboard");
  const [medicines, setMedicines] = useState(MEDICINES);
  const [customers, setCustomers] = useState(CUSTOMERS_SEED);
  const [toast, setToast] = useState(null);
  const inventoryQ = useInventoryMedicines();
  const customersQ = useCustomers();
  const remindersQ = useReminders();
  const adjustStockM = useAdjustStock();
  const recordPurchaseM = useRecordPurchase();
  const createProductM = useCreateProduct();
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

  useEffect(() => {
    if (!remindersQ.data || !Array.isArray(remindersQ.data)) return;
    const rows = remindersQ.data;
    setCustomers((prev) =>
      prev.map((c) => ({
        ...c,
        reminders: rows
          .filter((r) => String(r.customer_id) === String(c.id))
          .map((r) => ({ id: r.id, medicine: r.medicine, dueDate: r.due_date, sent: !!r.sent, note: r.note || "" }))
      }))
    );
  }, [remindersQ.data]);

  useEffect(() => {
    if (!user?.pharmacyId) return;
    trackEvent({ pharmacyId: user.pharmacyId, userId: String(user.id), eventName: "module_view", module: screen, metadata: {} });
  }, [screen, user?.pharmacyId, user?.id]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  // Auth is handled at the route level (`/login` + protected `/platform`).

  const alerts = medicines.map((m) => ({ ...m, status: getStockStatus(m) })).filter((m) => ["critical", "low", "expiring"].includes(m.status));
  const dueReminders = customers.filter((c) => c.reminders.some((r) => !r.sent));

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "⬡" },
    { id: "inventory", label: "Inventory", icon: "📦", badge: alerts.length },
    { id: "customers", label: "Customers", icon: "👥" },
    { id: "suppliers", label: "Suppliers", icon: "🏢" },
    { id: "reminders", label: "Reminders", icon: "🔔", badge: dueReminders.length },
    ...(user.role === "owner" || user.role === "admin"
      ? [
          { id: "staff", label: "Staff", icon: "👤" },
          { id: "financials", label: "Financials", icon: "📊" },
          { id: "analytics", label: "Analytics", icon: "🧠" },
          { id: "documents", label: "Documents", icon: "📁" }
        ]
      : [])
  ];

  const ownerOnly = ["staff", "financials", "analytics", "documents"];

  return (
    <div style={{ fontFamily: FONT, background: "#f8fafc", minHeight: "100vh", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 3px #fecaca}50%{opacity:.6;box-shadow:0 0 0 6px #fecaca20}}
        input:focus,select:focus,textarea:focus{border-color:#10b981!important;box-shadow:0 0 0 3px #10b98115!important;outline:none!important;}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#f1f5f9}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:99px}
        button:active{transform:scale(0.98)}
      `}</style>

      {/* ── Sidebar ── */}
      <aside style={{ width: 214, background: DARK, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.04)" }}>
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <BrandLogo height={34} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>Nevoutmeds</div>
              <div style={{ fontSize: 9, color: "#10b981", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 1 }}>Never Out of Stock</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px 4px" }}>Operations</div>
          {navItems
            .filter((i) => !["staff", "financials", "analytics", "documents"].includes(i.id))
            .map((item) => (
              <button key={item.id} onClick={() => setScreen(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 9, border: "none", background: screen === item.id ? "rgba(16,185,129,0.15)" : "transparent", color: screen === item.id ? "#6ee7b7" : "#64748b", fontSize: 13, fontWeight: screen === item.id ? 700 : 500, cursor: "pointer", fontFamily: FONT, marginBottom: 1, textAlign: "left", transition: "all 0.15s" }}>
                <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge > 0 && <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.badge}</span>}
              </button>
            ))}

          {(user.role === "owner" || user.role === "admin") && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", padding: "12px 12px 4px", marginTop: 4 }}>Owner Only</div>
              {navItems
                .filter((i) => ["staff", "financials", "analytics", "documents"].includes(i.id))
                .map((item) => (
                  <button key={item.id} onClick={() => setScreen(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 9, border: "none", background: screen === item.id ? "rgba(16,185,129,0.15)" : "transparent", color: screen === item.id ? "#6ee7b7" : "#64748b", fontSize: 13, fontWeight: screen === item.id ? 700 : 500, cursor: "pointer", fontFamily: FONT, marginBottom: 1, textAlign: "left", transition: "all 0.15s" }}>
                    <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </button>
                ))}
            </>
          )}
        </nav>

        {/* User footer */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 9, background: "rgba(255,255,255,0.04)" }}>
            <Avatar name={user.name} size={28} bg={GREEN} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
              <div style={{ fontSize: 9, color: GREEN, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{user.role}</div>
            </div>
            <button onClick={() => onLogout?.()} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13, padding: "3px 4px", borderRadius: 5, transition: "color 0.15s" }} title="Sign out">
              ⏻
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, overflowY: "auto", minHeight: "100vh" }}>
        {screen === "dashboard" && <DashboardScreen user={user} medicines={medicines} customers={customers} onNavigate={setScreen} onShowToast={showToast} />}
        {screen === "inventory" && (
          <InventoryScreen
            medicines={medicines}
            setMedicines={setMedicines}
            onShowToast={showToast}
            onAdjustStock={({ productId, delta, note }) => adjustStockM.mutateAsync({ productId, delta, note })}
            onCreateProduct={async (args) => {
              if (!configured) return;
              await createProductM.mutateAsync(args);
            }}
            dataStatus={{ loading: inventoryQ.isFetching, error: !!inventoryQ.error }}
          />
        )}
        {screen === "customers" && (
          <CustomersScreen
            customers={customers}
            setCustomers={setCustomers}
            medicines={medicines}
            onShowToast={showToast}
            dataStatus={{ loading: customersQ.isFetching, error: !!customersQ.error }}
            onRecordPurchase={async ({ customerId, method, items }) => {
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
              await recordPurchaseM.mutateAsync({ customerId, method, items });
            }}
          />
        )}
        {screen === "suppliers" && <SuppliersScreen medicines={medicines} onShowToast={showToast} />}
        {screen === "reminders" && (
          <RemindersScreen
            customers={customers}
            setCustomers={setCustomers}
            medicines={medicines}
            onShowToast={showToast}
            dataStatus={{ loading: remindersQ.isFetching, error: !!remindersQ.error }}
            onCreateReminder={({ customerId, medicine, dueDate, note }) => createReminderM.mutateAsync({ customerId, medicine, dueDate, note })}
            onMarkReminderSent={({ reminderId }) => markReminderSentM.mutateAsync({ reminderId })}
          />
        )}
        {screen === "staff" && (user.role === "owner" || user.role === "admin") && <StaffScreen onShowToast={showToast} />}
        {screen === "financials" && (user.role === "owner" || user.role === "admin") && <FinancialsScreen customers={customers} />}
        {screen === "analytics" && (user.role === "owner" || user.role === "admin") && <AnalyticsScreen medicines={medicines} customers={customers} />}
        {screen === "documents" && (user.role === "owner" || user.role === "admin") && <DocumentsScreen onShowToast={showToast} />}
        {ownerOnly.includes(screen) && !(user.role === "owner" || user.role === "admin") && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 32 }}>🔒</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>Restricted to pharmacy owners</div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Contact John Kamara to request access</div>
          </div>
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}

