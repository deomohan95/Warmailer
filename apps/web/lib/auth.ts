export const ACCESS_COOKIE = "wm_access";
export const REFRESH_COOKIE = "wm_refresh";
export const MYMAIDSPRO_LOGIN_ALIAS = "infomymaidspro";
export const MYMAIDSPRO_LOGIN_EMAIL = "infomymaidspro@gmail.com";

export type AuthUser = {
  id: string;
  email: string;
};

export function loginIdentifierToEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  return value === MYMAIDSPRO_LOGIN_ALIAS ? MYMAIDSPRO_LOGIN_EMAIL : value;
}

export function initialsFromEmail(email: string): string {
  return (email.split("@")[0] ?? "")
    .split(/[._-]+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function authApiKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing Supabase API key");
  return key;
}
