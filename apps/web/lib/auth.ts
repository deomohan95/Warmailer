export const ACCESS_COOKIE = "wm_access";
export const REFRESH_COOKIE = "wm_refresh";
export const MYMAIDSPRO_LOGIN_ALIAS = "infomymaidspro";
export const MYMAIDSPRO_LOGIN_EMAIL = "infomymaidspro@gmail.com";
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type Env = Record<string, string | undefined>;
type FetchAuth = typeof fetch;

export type AuthUser = {
  id: string;
  email: string;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
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

export function supabaseAuthUrl(env: Env = process.env): string {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url.replace(/\/$/, "");
}

export function authApiKey(env: Env = process.env): string {
  const key =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing Supabase API key");
  return key;
}

export async function refreshSupabaseSession(
  refreshToken: string,
  env: Env = process.env,
  fetchAuth: FetchAuth = fetch,
): Promise<SupabaseSession | null> {
  const response = await fetchAuth(`${supabaseAuthUrl(env)}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: authApiKey(env),
      "content-type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) return null;
  return (await response.json()) as SupabaseSession;
}
