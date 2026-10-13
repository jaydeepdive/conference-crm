/**
 * Resend email sender for attendee-facing mail (invites, login links).
 * Sends as "Above & Beyond Mining Summit <no-reply@abovebeyondsummit.com>".
 *
 * Key lookup: RESEND_API_KEY env var, else public.app_secrets('resend_api_key')
 * (service-role only table, RLS with no policies).
 */
import { createServiceClient } from "@/lib/supabase/service";

export const ATTENDEE_FROM = "Above & Beyond Mining Summit <no-reply@abovebeyondsummit.com>";

let cachedKey: string | null = null;

async function getResendKey(): Promise<string | null> {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  if (cachedKey) return cachedKey;
  const svc = createServiceClient();
  const { data } = await svc.from("app_secrets").select("value").eq("key", "resend_api_key").maybeSingle();
  cachedKey = (data as { value?: string } | null)?.value ?? null;
  return cachedKey;
}

export async function resendConfigured(): Promise<boolean> {
  return !!(await getResendKey());
}

export async function sendResend(args: {
  to: string; subject: string; html: string; text?: string; replyTo?: string | null;
}): Promise<string> {
  const key = await getResendKey();
  if (!key) throw new Error("Resend is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ATTENDEE_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      ...(args.text ? { text: args.text } : {}),
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
    }),
  });
  const j = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok) throw new Error(j.message ?? `Resend error ${res.status}`);
  return j.id ?? "";
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] ?? c));
}

/** Above & Beyond branded email: black header w/ logo, ivory body, gold button. */
export function brandedEmail(opts: {
  origin: string; heading: string; greeting: string; paragraphs: string[];
  buttonLabel: string; url: string; footnote?: string;
}): { html: string; text: string } {
  const { origin, heading, greeting, paragraphs, buttonLabel, url, footnote } = opts;
  const html = `<!doctype html><html><body style="margin:0;background:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td align="center" style="padding:8px 0 20px;">
  <img src="${origin}/brand/logo-official.jpg" alt="Above &amp; Beyond Mining Summit" width="220" style="display:block;width:220px;max-width:70%;height:auto;border:0;">
  <div style="margin-top:10px;font-family:Georgia,'Times New Roman',serif;font-size:12px;letter-spacing:3px;color:#c9a24b;text-transform:uppercase;">November 22&ndash;24 &middot; Scottsdale, Arizona</div>
</td></tr>
<tr><td style="background:#f5f0e6;border-top:3px solid #c9a24b;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#14120e;line-height:1.6;font-size:15px;">
  <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:26px;color:#14120e;">${esc(heading)}</h1>
  <p style="margin:0 0 14px;">${esc(greeting)}</p>
  ${paragraphs.map(p => `<p style="margin:0 0 14px;">${p}</p>`).join("\n  ")}
  <p style="margin:24px 0;"><a href="${url}" style="display:inline-block;background:#c9a24b;color:#0a0a0a;padding:14px 26px;text-decoration:none;font-weight:600;letter-spacing:2px;text-transform:uppercase;font-size:13px;">${esc(buttonLabel)}</a></p>
  <p style="margin:0;font-size:12px;color:#6e6656;">Or paste this link into your browser:<br><span style="word-break:break-all;">${url}</span></p>
  ${footnote ? `<p style="margin:16px 0 0;font-size:12px;color:#6e6656;">${footnote}</p>` : ""}
</td></tr>
<tr><td align="center" style="padding:18px 0;font-family:Arial,sans-serif;font-size:11px;color:#9a9a9a;">Above &amp; Beyond Mining Summit &middot; Andaz Scottsdale Resort</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${greeting}\n\n${paragraphs.map(p => p.replace(/<[^>]+>/g, "").replace(/&rsquo;/g, "'").replace(/&amp;/g, "&")).join("\n\n")}\n\n${buttonLabel}: ${url}\n`;
  return { html, text };
}
