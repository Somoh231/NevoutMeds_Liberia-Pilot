export const SUPPLIER_DATA = [
  {
    id: 1,
    name: "MedSupply West Africa",
    country: "Liberia",
    city: "Monrovia",
    phone: "+231-88-555-0001",
    whatsapp: "+231885550001",
    email: "orders@medsupplywa.com",
    leadDays: 2,
    rating: 4.8,
    reviews: 47,
    onTimeRate: 96,
    verified: true,
    minOrder: 50,
    returnPolicy: "30 days",
    paymentTerms: "Net 14",
    deliveryZones: ["Montserrado", "Margibi", "Grand Bassa"],
    catalogue: [
      { medicineId: 1, price: 0.22, stock: "In stock", moq: 50 },
      { medicineId: 2, price: 1.4, stock: "In stock", moq: 21 },
      { medicineId: 4, price: 0.68, stock: "In stock", moq: 30 },
      { medicineId: 6, price: 0.82, stock: "In stock", moq: 30 },
      { medicineId: 8, price: 0.55, stock: "In stock", moq: 20 }
    ],
    orders: [
      { date: "2026-04-10", items: "Paracetamol x100, Amoxicillin x42", total: 185, status: "delivered", deliveredIn: 2 },
      { date: "2026-03-22", items: "Metformin x60, Chloroquine x40", total: 116, status: "delivered", deliveredIn: 1 },
      { date: "2026-03-05", items: "Ibuprofen x60", total: 49, status: "delivered", deliveredIn: 2 }
    ]
  },
  {
    id: 2,
    name: "PharmaCorp International",
    country: "Sierra Leone",
    city: "Freetown",
    phone: "+232-76-555-0002",
    whatsapp: "+232765550002",
    email: "sales@pharmacorp.sl",
    leadDays: 5,
    rating: 4.3,
    reviews: 29,
    onTimeRate: 88,
    verified: true,
    minOrder: 100,
    returnPolicy: "14 days",
    paymentTerms: "Net 7",
    deliveryZones: ["Montserrado", "Margibi"],
    catalogue: [
      { medicineId: 1, price: 0.26, stock: "In stock", moq: 100 },
      { medicineId: 3, price: 2.6, stock: "In stock", moq: 24 },
      { medicineId: 5, price: 0.13, stock: "In stock", moq: 50 },
      { medicineId: 7, price: 0.18, stock: "In stock", moq: 40 }
    ],
    orders: [
      { date: "2026-04-01", items: "Artemether x48, ORS x100", total: 138, status: "delivered", deliveredIn: 4 },
      { date: "2026-02-14", items: "Zinc x80, ORS x50", total: 22, status: "delivered", deliveredIn: 6 }
    ]
  },
  {
    id: 3,
    name: "HealthBridge Distributors",
    country: "Ghana",
    city: "Accra",
    phone: "+233-30-555-0003",
    whatsapp: "+233305550003",
    email: "info@healthbridge.gh",
    leadDays: 8,
    rating: 4.6,
    reviews: 18,
    onTimeRate: 92,
    verified: true,
    minOrder: 200,
    returnPolicy: "7 days",
    paymentTerms: "Prepaid",
    deliveryZones: ["Montserrado"],
    catalogue: [
      { medicineId: 2, price: 1.3, stock: "Limited", moq: 42 },
      { medicineId: 3, price: 2.45, stock: "In stock", moq: 48 },
      { medicineId: 6, price: 0.78, stock: "In stock", moq: 60 },
      { medicineId: 7, price: 0.16, stock: "In stock", moq: 80 }
    ],
    orders: []
  }
];

