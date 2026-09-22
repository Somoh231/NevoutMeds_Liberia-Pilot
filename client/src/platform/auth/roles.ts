import type { Role, User } from "@/platform/domain";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// Role is never read from user_metadata: users can write that themselves with
// auth.updateUser({ data: { role: "admin" } }). The only trusted source is the
// users_profiles row, which RLS and a trigger protect. Until that row loads,
// the user is treated as the least-privileged role.
export function getUserRole(_su: SupabaseUser | null): Role {
  return "staff";
}

export function toPlatformUser(su: SupabaseUser): User {
  const role = getUserRole(su);
  const name = ((su.user_metadata as any)?.name as string | undefined) ?? su.email ?? "User";
  const pharmacy = ((su.user_metadata as any)?.pharmacy as string | undefined) ?? "Monrovia Central Pharmacy";
  // pharmacy_id likewise only ever comes from the profile row.
  const pharmacyId = undefined;
  return {
    id: su.id,
    name,
    role,
    pharmacy,
    pharmacyId
  };
}

