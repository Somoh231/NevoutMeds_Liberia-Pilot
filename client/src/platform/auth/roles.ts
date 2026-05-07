import type { Role, User } from "@/platform/domain";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function getUserRole(su: SupabaseUser | null): Role {
  if (!su) return "staff";
  const fromApp = (su.app_metadata as any)?.role;
  const fromUser = (su.user_metadata as any)?.role;
  const role = (fromApp ?? fromUser ?? "staff") as string;
  if (role === "admin") return "admin";
  if (role === "owner") return "owner";
  return "staff";
}

export function toPlatformUser(su: SupabaseUser): User {
  const role = getUserRole(su);
  const name = ((su.user_metadata as any)?.name as string | undefined) ?? su.email ?? "User";
  const pharmacy = ((su.user_metadata as any)?.pharmacy as string | undefined) ?? "Monrovia Central Pharmacy";
  const pharmacyId = ((su.user_metadata as any)?.pharmacy_id as string | undefined) ?? undefined;
  return {
    id: su.id,
    name,
    role,
    pharmacy,
    pharmacyId
  };
}

