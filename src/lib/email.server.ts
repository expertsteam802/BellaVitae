const FROM = process.env["EMAIL_FROM"] ?? "";
const RESEND_API_KEY = process.env["RESEND_API_KEY"] ?? "";

export function emailConfigured() {
  return Boolean(FROM && RESEND_API_KEY);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!FROM || !RESEND_API_KEY) {
    return { sent: false, error: "Email is not configured. Set EMAIL_FROM and RESEND_API_KEY." };
  }

  try {
    const headers = new Headers({
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    });
    if (opts.idempotencyKey) headers.set("Idempotency-Key", opts.idempotencyKey);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { sent: false, error: `Email provider returned ${response.status}: ${detail.slice(0, 300)}` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Could not send the email" };
  }
}
