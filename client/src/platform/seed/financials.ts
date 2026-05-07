export const FINANCIALS = {
  revenue: {
    mtd: 4820,
    last30: [
      142, 165, 138, 190, 175, 210, 188, 165, 220, 195, 180, 205, 175, 190, 210, 188, 165, 220, 245, 190, 205, 180, 195,
      215, 188, 230, 210, 195, 220, 240
    ],
    ytd: 18640,
    lastYear: 15200
  },
  expenses: {
    mtd: 2140,
    categories: [
      { name: "Supplier Payments", amount: 1420, pct: 66 },
      { name: "Staff Wages", amount: 380, pct: 18 },
      { name: "Rent & Utilities", amount: 220, pct: 10 },
      { name: "Other", amount: 120, pct: 6 }
    ]
  },
  debt: {
    total: 2800,
    breakdown: [
      { supplier: "MedSupply West Africa", amount: 1800, dueDate: "2026-05-10", interest: 0, status: "current", daysOverdue: 0 },
      { supplier: "PharmaCorp International", amount: 650, dueDate: "2026-04-28", interest: 2.5, status: "due-soon", daysOverdue: 0 },
      { supplier: "Local Distributor Ltd", amount: 350, dueDate: "2026-04-15", interest: 5.0, status: "overdue", daysOverdue: 7 }
    ]
  },
  profit: { mtd: 2680, margin: 55.6 },
  cashflow: {
    current: 3240,
    projected30: 4100,
    weekly: [2100, 2450, 2800, 3240],
    inflows: [
      { label: "Sales (est.)", amount: 4820 },
      { label: "Credit Collections", amount: 350 }
    ],
    outflows: [
      { label: "Supplier Debt Due", amount: 650 },
      { label: "Wages", amount: 380 },
      { label: "Rent", amount: 220 },
      { label: "Other", amount: 120 }
    ]
  }
};

