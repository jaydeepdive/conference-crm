import { google } from "googleapis";
import { createClient } from "./supabase/server";

/** Gets a fresh Gmail access token for the current user, refreshing if needed. */
export async function getValidGmailAccessToken(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: token } = await supabase.from("gmail_tokens")
    .select("*").eq("profile_id", userId).maybeSingle();
  if (!token) return null;

  const expired = !token.expires_at || new Date(token.expires_at) < new Date(Date.now() + 60_000);
  if (!expired) return token.access_token;
  if (!token.refresh_token) return null;

  // Refresh using Google's OAuth endpoint
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: token.refresh_token });

  try {
    const { credentials } = await oauth2.refreshAccessToken();
    if (!credentials.access_token) return null;

    await supabase.from("gmail_tokens").update({
      access_token: credentials.access_token,
      expires_at: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("profile_id", userId);

    return credentials.access_token;
  } catch {
    return null;
  }
}

export interface SendEmailArgs {
  accessToken: string;
  to: { email: string; name?: string }[];
  cc?: { email: string; name?: string }[];
  bcc?: { email: string; name?: string }[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachment?: { filename: string; mimeType: string; contentBase64: string };
}

/** Sends an email via Gmail API using the supplied access token. Returns the Gmail message id. */
export async function sendGmail(args: SendEmailArgs): Promise<string> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: args.accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const raw = buildRawMime(args);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return res.data.id ?? "";
}

function formatAddress(a: { email: string; name?: string }): string {
  return a.name ? `"${a.name.replace(/"/g, "\\\"")}" <${a.email}>` : a.email;
}

function buildRawMime(args: SendEmailArgs): string {
  const boundary = `bnd_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `alt_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];

  lines.push(`To: ${args.to.map(formatAddress).join(", ")}`);
  if (args.cc?.length) lines.push(`Cc: ${args.cc.map(formatAddress).join(", ")}`);
  if (args.bcc?.length) lines.push(`Bcc: ${args.bcc.map(formatAddress).join(", ")}`);
  lines.push(`Subject: ${args.subject}`);
  lines.push("MIME-Version: 1.0");

  if (args.attachment) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push("");
    lines.push(...buildAlternativeBody(altBoundary, args.bodyText, args.bodyHtml));
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${args.attachment.mimeType}; name="${args.attachment.filename}"`);
    lines.push(`Content-Disposition: attachment; filename="${args.attachment.filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(...chunk76(args.attachment.contentBase64));
    lines.push(`--${boundary}--`);
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push("");
    lines.push(...buildAlternativeBody(altBoundary, args.bodyText, args.bodyHtml));
  }

  const mime = lines.join("\r\n");
  // base64url encoding for Gmail API
  return Buffer.from(mime).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildAlternativeBody(boundary: string, text: string | undefined, html: string): string[] {
  const result: string[] = [];
  result.push(`--${boundary}`);
  result.push("Content-Type: text/plain; charset=UTF-8");
  result.push("Content-Transfer-Encoding: 7bit");
  result.push("");
  result.push(text ?? stripHtml(html));
  result.push(`--${boundary}`);
  result.push("Content-Type: text/html; charset=UTF-8");
  result.push("Content-Transfer-Encoding: 7bit");
  result.push("");
  result.push(html);
  result.push(`--${boundary}--`);
  return result;
}

function chunk76(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += 76) out.push(s.slice(i, i + 76));
  return out;
}

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
