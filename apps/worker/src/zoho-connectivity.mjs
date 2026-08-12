const regionDomains = {
  us: "zoho.com",
  eu: "zoho.eu",
  in: "zoho.in",
  au: "zoho.com.au",
};

export function resolveZohoHosts({ region = "us", smtpHost, imapHost, smtpPort = 465, imapPort = 993 } = {}) {
  const domain = regionDomains[region] ?? regionDomains.us;

  return {
    smtpHost: smtpHost ?? `smtp.${domain}`,
    imapHost: imapHost ?? `imap.${domain}`,
    smtpPort,
    imapPort,
  };
}

export async function testZohoConnectivity({ mailbox, smtpProbe, imapProbe }) {
  if (!mailbox || typeof mailbox.email !== "string" || typeof mailbox.appPassword !== "string") {
    throw new Error("mailbox email and appPassword are required");
  }

  if (typeof smtpProbe !== "function" || typeof imapProbe !== "function") {
    throw new Error("smtpProbe and imapProbe are required");
  }

  const hosts = resolveZohoHosts(mailbox);
  const baseSettings = {
    username: mailbox.email,
    password: mailbox.appPassword,
    secure: true,
  };

  try {
    const smtp = await smtpProbe({
      ...baseSettings,
      protocol: "smtp",
      host: hosts.smtpHost,
      port: hosts.smtpPort,
    });
    const imap = await imapProbe({
      ...baseSettings,
      protocol: "imap",
      host: hosts.imapHost,
      port: hosts.imapPort,
    });

    return { ok: true, smtp, imap };
  } catch (error) {
    return { ok: false, error: classifyMailConnectionError(error) };
  }
}

export function classifyMailConnectionError(error) {
  const responseCode = Number(error?.responseCode);
  const code = typeof error?.code === "string" ? error.code : "";

  if (code === "EAUTH" || responseCode === 535 || responseCode === 534) {
    return failure("auth", false, "Authentication failed");
  }

  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET"].includes(code)) {
    return failure(code === "ENOTFOUND" || code === "EAI_AGAIN" ? "dns" : "tls", true, "Connection failed");
  }

  if (code === "ETIMEDOUT" || code === "ETIMEOUT") {
    return failure("timeout", true, "Connection timed out");
  }

  if (responseCode === 421 || responseCode === 450 || responseCode === 451 || responseCode === 452) {
    return failure("transient", true, "Mail server reported a transient failure");
  }

  if (responseCode === 454) {
    return failure("rate_limit", true, "Mail server reported rate limiting");
  }

  if (responseCode >= 500 && responseCode <= 599) {
    return failure("permanent", false, "Mail server reported a permanent failure");
  }

  return failure("unknown", false, "Mail connection failed");
}

function failure(kind, retryable, message) {
  return { kind, retryable, message };
}
