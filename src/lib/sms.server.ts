export type SmsResult = { sent: boolean; provider: string; error?: string };

/** Rwandan numbers are often typed as 0788… or 788… — normalise to E.164. */
export function toE164(raw: string): string {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("250")) return `+${digits}`;
  if (digits.startsWith("0")) return `+250${digits.slice(1)}`;
  if (digits.length === 9) return `+250${digits}`;
  return `+${digits}`;
}

function sender() {
  const from = process.env["TWILIO_FROM_NUMBER"] ?? process.env["TWILIO_PHONE_NUMBER"];
  const service = process.env["TWILIO_MESSAGING_SERVICE_SID"];
  if (service) return { MessagingServiceSid: service };
  if (from) return { From: from };
  return null;
}

/** Sends SMS directly through the official Twilio API using server-only credentials. */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const destination = toE164(to);
  if (!destination) return { sent: false, provider: "none", error: "Invalid phone number" };
  const fromFields = sender();
  if (!fromFields) return { sent: false, provider: "none", error: "No Twilio sending number configured" };

  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token) return { sent: false, provider: "none", error: "Twilio credentials are not configured" };

  const params = new URLSearchParams({ To: destination, Body: body, ...fromFields });
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`[sms] send failed [${response.status}]: ${detail}`);
      return { sent: false, provider: "twilio", error: `[${response.status}] ${detail}` };
    }
    return { sent: true, provider: "twilio" };
  } catch (error) {
    return { sent: false, provider: "twilio", error: error instanceof Error ? error.message : "SMS send failed" };
  }
}

export function smsConfigured() {
  const hasSender = Boolean(process.env["TWILIO_FROM_NUMBER"] || process.env["TWILIO_PHONE_NUMBER"] || process.env["TWILIO_MESSAGING_SERVICE_SID"]);
  const hasAuth = Boolean(process.env["TWILIO_ACCOUNT_SID"] && process.env["TWILIO_AUTH_TOKEN"]);
  return hasSender && hasAuth;
}
