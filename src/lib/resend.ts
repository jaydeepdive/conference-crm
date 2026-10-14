/**
 * Resend email sender for attendee-facing mail (invites, login links).
 * Sends as "Above & Beyond Mining Summit <no-reply@abovebeyondsummit.com>".
 *
 * Key lookup: RESEND_API_KEY env var, else public.app_secrets('resend_api_key')
 * (service-role only table, RLS with no policies).
 */
import { createServiceClient } from "@/lib/supabase/service";
import { PORTAL_ORIGIN } from "@/lib/portalDomain";

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

/** Public URL for images in emails (must be reachable by mail clients). */
const EMAIL_ASSET_ORIGIN = PORTAL_ORIGIN;

/**
 * Above & Beyond branded email. Light, table-based layout that renders the
 * same in Gmail, Outlook and Apple Mail (dark full-bleed backgrounds break in
 * Outlook/dark mode). Black logo band, white card, gold button, optional
 * details table, plain-text alternative always included.
 */
export function brandedEmail(opts: {
  origin?: string; heading: string; greeting: string; paragraphs: string[];
  buttonLabel: string; url: string; footnote?: string;
  details?: [string, string][];
  preheader?: string;
}): { html: string; text: string } {
  const { heading, greeting, paragraphs, buttonLabel, url, footnote, details, preheader } = opts;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const serif = "Georgia,'Times New Roman',serif";
  const detailsHtml = details && details.length ? `
          <tr><td style="padding:4px 28px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6dfcf;background:#faf8f3;">
              ${details.map(([k, v], i) => `<tr>
                <td style="padding:12px 16px;${i ? "border-top:1px solid #e6dfcf;" : ""}font:600 11px/1.4 ${font};letter-spacing:1.5px;text-transform:uppercase;color:#8f6f2a;width:34%;vertical-align:top;">${esc(k)}</td>
                <td style="padding:12px 16px;${i ? "border-top:1px solid #e6dfcf;" : ""}font:15px/1.5 ${font};color:#1c1a16;vertical-align:top;">${esc(v)}</td>
              </tr>`).join("")}
            </table>
          </td></tr>` : "";
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f0e9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader ?? heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e9;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e6dfcf;">
      <tr><td align="center" style="background:#000000;padding:20px 24px 14px;">
        <img src="${EMAIL_ASSET_ORIGIN}/brand/logo-official.jpg" width="240" alt="Above &amp; Beyond Summit" style="display:block;width:240px;max-width:80%;height:auto;border:0;">
      </td></tr>
      <tr><td style="background:#000000;padding:0 24px 16px;" align="center">
        <div style="font:500 11px/1.4 ${font};letter-spacing:3px;text-transform:uppercase;color:#c9a24b;">November 22&ndash;24, 2026 &nbsp;&middot;&nbsp; Scottsdale, Arizona</div>
      </td></tr>
      <tr><td style="height:3px;background:#c9a24b;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:32px 28px 8px;">
        <h1 style="margin:0 0 20px;font:400 28px/1.25 ${serif};color:#1c1a16;">${esc(heading)}</h1>
        <p style="margin:0 0 16px;font:16px/1.6 ${font};color:#1c1a16;">${esc(greeting)}</p>
        ${paragraphs.map(p => `<p style="margin:0 0 16px;font:16px/1.6 ${font};color:#3a362e;">${p}</p>`).join("\n        ")}
      </td></tr>${detailsHtml}
      <tr><td align="center" style="padding:20px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td align="center" bgcolor="#c9a24b" style="background:#c9a24b;">
            <a href="${url}" style="display:inline-block;padding:15px 34px;font:700 13px/1 ${font};letter-spacing:2px;text-transform:uppercase;color:#000000;text-decoration:none;">${esc(buttonLabel)}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:0 28px 32px;">
        <p style="margin:0;font:13px/1.6 ${font};color:#7a7363;">Button not working? Copy this link into your browser:<br>
        <a href="${url}" style="color:#8f6f2a;word-break:break-all;">${url}</a></p>
        ${footnote ? `<p style="margin:14px 0 0;font:13px/1.6 ${font};color:#7a7363;">${footnote}</p>` : ""}
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td align="center" style="padding:20px 24px;font:12px/1.6 ${font};color:#8a8475;">
        Above &amp; Beyond Mining Summit &middot; Andaz Scottsdale Resort &amp; Bungalows &middot; Scottsdale, Arizona<br>
        You&rsquo;re receiving this because you&rsquo;re registered for the summit.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  const strip = (x: string) => x.replace(/<[^>]+>/g, "").replace(/&rsquo;/g, "\u2019").replace(/&amp;/g, "&").replace(/&ndash;/g, "\u2013");
  const text = [
    heading, "", greeting, "",
    ...paragraphs.map(p => strip(p) + "\n"),
    ...(details ?? []).map(([k, v]) => `${k}: ${v}`),
    details?.length ? "" : "",
    `${buttonLabel}: ${url}`, "",
    ...(footnote ? [strip(footnote), ""] : []),
    "Above & Beyond Mining Summit · Andaz Scottsdale Resort & Bungalows · Scottsdale, Arizona",
  ].join("\n");
  return { html, text };
}
