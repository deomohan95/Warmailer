import { envValue } from "../../../lib/backend-data";

export async function triggerImmediateSend(requestUrl: string) {
  const secret = envValue("CRON_SECRET");
  if (!secret) return;
  const url = new URL("/api/cron/send", requestUrl);
  await fetch(url.toString(), { headers: { authorization: `Bearer ${secret}` } }).catch(() => {});
}
