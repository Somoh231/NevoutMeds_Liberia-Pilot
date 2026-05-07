export type Role = "owner" | "staff" | "admin";

export type User = {
  id: string | number;
  name: string;
  role: Role;
  pharmacy: string;
  pharmacyId?: string;
};

export type Medicine = {
  id: string | number;
  name: string;
  brand?: string;
  category: string;
  stock: number;
  reorderPoint: number;
  maxStock: number;
  dailyVelocity: number;
  unitCost: number;
  sellingPrice: number;
  unit?: string;
  batchId?: string;
  expiryDate?: string;
  supplierId?: string | number | null;
  isEssential?: boolean;
  requiresPrescription?: boolean;
};

export type Supplier = {
  id: string | number;
  name: string;
  country?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
};

export type Reminder = {
  medicine: string;
  dueDate: string;
  sent: boolean;
  note?: string;
};

export type Purchase = {
  date: string;
  items: string;
  amount: number;
  method: string;
  staffId?: string | number;
};

export type Customer = {
  id: string | number;
  phone: string;
  firstName: string;
  lastName: string;
  community?: string;
  landmark?: string;
  county?: string;
  creditBalance: number;
  creditLimit: number;
  reminders: Reminder[];
  purchases: Purchase[];
  totalSpend?: number;
  visitCount?: number;
  lastVisit?: string;
  notes?: string;
};

export type DocumentCategory = "registration" | "audit" | "supplier" | "financial" | "staff" | "other";

export type DocumentRecord = {
  id: string | number;
  name: string;
  category: DocumentCategory;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  expiryDate: string | null;
  status: "active" | "archived";
  note: string;
  tags: string[];
};

