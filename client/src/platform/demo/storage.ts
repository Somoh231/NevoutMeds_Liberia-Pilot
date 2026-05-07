const KEY_MEDICINES = "nevoutmeds_demo_medicines_v1";
const KEY_CUSTOMERS = "nevoutmeds_demo_customers_v1";

export function loadDemoState<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveDemoState(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode errors
  }
}

export function loadDemoMedicines<T>() {
  return loadDemoState<T>(KEY_MEDICINES);
}

export function saveDemoMedicines(value: unknown) {
  saveDemoState(KEY_MEDICINES, value);
}

export function loadDemoCustomers<T>() {
  return loadDemoState<T>(KEY_CUSTOMERS);
}

export function saveDemoCustomers(value: unknown) {
  saveDemoState(KEY_CUSTOMERS, value);
}

