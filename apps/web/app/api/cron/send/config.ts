import { envValue } from "../../../../lib/backend-data";

export type SendConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  encryptionKey: Buffer;
  trackingBaseUrl: string;
  trackingHmacKey: Buffer;
  smtpHost: string;
  smtpPort: number;
};

export function loadSendConfig(env: Record<string, string | undefined> = process.env): SendConfig {
  const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL", env)?.replace(/\/$/, "");
  const supabaseKey = envValue("SUPABASE_SECRET_KEY", env) ?? envValue("SUPABASE_SERVICE_ROLE_KEY", env);
  const trackingBaseUrl = envValue("TRACKING_BASE_URL", env)?.replace(/\/$/, "");
  const config = {
    supabaseUrl,
    supabaseKey,
    encryptionKey: Buffer.from(envValue("WORKER_ENCRYPTION_KEY", env) ?? "", "base64"),
    trackingBaseUrl,
    trackingHmacKey: Buffer.from(envValue("TRACKING_HMAC_KEY", env) ?? "", "base64"),
    smtpHost: envValue("ZOHO_SMTP_HOST", env) ?? "smtp.zoho.com",
    smtpPort: Number(envValue("ZOHO_SMTP_PORT", env) ?? 465),
  };

  if (!config.supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!config.supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!config.trackingBaseUrl) throw new Error("Missing TRACKING_BASE_URL");
  if (config.encryptionKey.length !== 32) throw new Error("Missing WORKER_ENCRYPTION_KEY");
  if (config.trackingHmacKey.length !== 32) throw new Error("Missing TRACKING_HMAC_KEY");
  return config as SendConfig;
}
