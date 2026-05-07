// Phase 4: strongly typed table rows (RLS-ready; generated types can replace later)
export type UUID = string;
export type ISODateString = string; // YYYY-MM-DD
export type ISODateTimeString = string; // timestamptz string

export type UserRole = "owner" | "staff" | "admin";
export type DocumentStatus = "active" | "archived";
export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";

export type PharmacyRow = {
  id: UUID;
  name: string;
  country: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type UserRow = {
  id: UUID; // auth.users.id
  pharmacy_id: UUID;
  role: UserRole;
  name: string;
  email: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

// Spec-aligned alias (schema uses `users_profiles`)
export type UserProfileRow = UserRow;

export type SupplierRow = {
  id: UUID;
  pharmacy_id: UUID;
  name: string;
  country: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  lead_days: number | null;
  verified: boolean;
  rating: number | null;
  reviews: number | null;
  on_time_rate: number | null;
  min_order: number | null;
  payment_terms: string | null;
  return_policy: string | null;
  delivery_zones: string[];
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type SupplierCatalogueRow = {
  id: UUID;
  pharmacy_id: UUID;
  supplier_id: UUID;
  sku: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  unit: string | null;
  unit_cost: number;
  currency: string;
  moq: number | null;
  is_active: boolean;
  stock_status: string | null;
  available_stock: number | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type ProductRow = {
  id: UUID;
  pharmacy_id: UUID;
  name: string;
  brand: string | null;
  category: string;
  unit: string | null;
  unit_cost: number;
  selling_price: number;
  daily_velocity: number;
  reorder_point: number;
  max_stock: number;
  supplier_id: UUID | null;
  is_essential: boolean;
  requires_prescription: boolean;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type InventoryRow = {
  id: UUID;
  pharmacy_id: UUID;
  product_id: UUID;
  stock: number;
  batch_id: string | null;
  expiry_date: ISODateString | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type StockMovementRow = {
  id: UUID;
  pharmacy_id: UUID;
  product_id: UUID;
  delta: number;
  note: string | null;
  occurred_at: ISODateTimeString;
  created_by: UUID | null;
};

export type CustomerRow = {
  id: UUID;
  pharmacy_id: UUID;
  phone: string;
  first_name: string;
  last_name: string;
  community: string | null;
  landmark: string | null;
  county: string | null;
  credit_balance: number;
  credit_limit: number;
  alt_phone: string | null;
  alt_name: string | null;
  dob: ISODateString | null;
  gender: string | null;
  registered_at: ISODateString;
  conditions: string[];
  allergies: string[];
  last_visit: ISODateString;
  visit_count: number;
  total_spend: number;
  notes: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type PurchaseRow = {
  id: UUID;
  pharmacy_id: UUID;
  customer_id: UUID;
  purchased_at: ISODateTimeString;
  items_text: string;
  amount: number;
  method: string;
  staff_id: UUID | null;
  created_at: ISODateTimeString;
};

export type PurchaseItemRow = {
  id: UUID;
  pharmacy_id: UUID;
  purchase_id: UUID;
  product_id: UUID | null;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  created_at: ISODateTimeString;
};

export type DocumentRow = {
  id: UUID;
  pharmacy_id: UUID;
  name: string;
  category: string;
  size: number;
  uploaded_at: ISODateString;
  uploaded_by: UUID | null;
  expiry_date: ISODateString | null;
  status: DocumentStatus;
  note: string;
  tags: string[];
  storage_path: string | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type ReminderRow = {
  id: UUID;
  pharmacy_id: UUID;
  customer_id: UUID | null;
  medicine: string;
  due_date: ISODateString;
  sent: boolean;
  note: string | null;
  created_at: ISODateTimeString;
  sent_at: ISODateTimeString | null;
};

export type PurchaseOrderRow = {
  id: UUID;
  pharmacy_id: UUID;
  supplier_id: UUID;
  status: PurchaseOrderStatus;
  ordered_at: ISODateTimeString | null;
  received_at: ISODateTimeString | null;
  currency: string;
  total: number;
  whatsapp_message: string | null;
  created_by: UUID | null;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
};

export type PurchaseOrderItemRow = {
  id: UUID;
  pharmacy_id: UUID;
  purchase_order_id: UUID;
  product_id: UUID | null;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  created_at: ISODateTimeString;
};

