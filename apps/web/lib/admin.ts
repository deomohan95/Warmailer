import { getAuthUser } from "./backend-data";

export const WARMUP_ADMIN_EMAIL = "infomymaidspro@gmail.com";

export function isWarmupAdminEmail(email?: string | null) {
  return email?.trim().toLowerCase() === WARMUP_ADMIN_EMAIL;
}

export async function requireWarmupAdmin() {
  const user = await getAuthUser();
  if (!isWarmupAdminEmail(user?.email)) throw new Error("Forbidden");
  return user;
}
