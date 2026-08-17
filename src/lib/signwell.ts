/**
 * Thin SignWell REST client.
 *
 * Docs: https://developers.signwell.com/reference/
 *
 * Auth: SignWell uses an "X-Api-Key" header on every request. The key + the
 * (optional) API-application id come from env vars so we never commit them.
 * If a template or document is meant to belong to a specific API application
 * (multi-tenant workspaces), pass `api_application_id` in the body — we default
 * to `SIGNWELL_API_APPLICATION_ID` when present.
 *
 * All functions throw `SignWellError` on non-2xx responses. Callers are
 * expected to try/catch and translate to a NextResponse.
 */

const BASE = "https://www.signwell.com/api/v1";

export class SignWellError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
    this.name = "SignWellError";
  }
}

function apiKey(): string {
  const k = process.env.SIGNWELL_API_KEY;
  if (!k) throw new SignWellError(503, "SIGNWELL_API_KEY is not configured on the server");
  return k;
}

function apiAppId(): string | undefined {
  const v = process.env.SIGNWELL_API_APPLICATION_ID;
  return v && v.trim() ? v.trim() : undefined;
}

async function call<T = unknown>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "X-Api-Key": apiKey(),
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try { json = JSON.parse(text); } catch { /* not JSON */ }
  }
  if (!res.ok) {
    const message = (json && typeof json === "object" && "errors" in json)
      ? JSON.stringify((json as { errors: unknown }).errors)
      : text || `${res.status} ${res.statusText}`;
    throw new SignWellError(res.status, `SignWell ${method} ${path}: ${message}`, json);
  }
  return (json ?? {}) as T;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface SignWellTemplateSummary {
  id: string;
  name: string;
  created_at?: string;
}

export interface SignWellTemplateField {
  id?: string;              // internal id
  api_id: string;           // the id you pass to template_fields[].api_id
  name?: string;
  label?: string;
  type?: string;            // "text" | "signature" | "initials" | "date" | ...
  required?: boolean;
  placeholder_name?: string; // which signer role this field belongs to
}

export interface SignWellTemplatePlaceholder {
  id?: string;
  name: string;      // the placeholder_name — matched by recipients
  order?: number;
}

export interface SignWellTemplate {
  id: string;
  name: string;
  fields: SignWellTemplateField[];
  placeholders: SignWellTemplatePlaceholder[];
  created_at?: string;
}

/**
 * List every template on the workspace. SignWell paginates but for a small
 * shop (< 100 templates) the first page is fine. If we ever hit that limit
 * we can add cursor handling.
 */
export async function listTemplates(): Promise<SignWellTemplateSummary[]> {
  const res = await call<{ templates?: SignWellTemplateSummary[] } | SignWellTemplateSummary[]>(
    "GET", "/templates",
  );
  if (Array.isArray(res)) return res;
  return res.templates ?? [];
}

/**
 * Fetch a single template so we can enumerate its fields and placeholders.
 * We use the response to populate the "which field is Company Name?" picker
 * in the CRM settings UI.
 */
export async function getTemplate(templateId: string): Promise<SignWellTemplate> {
  const raw = await call<Record<string, unknown>>("GET", `/templates/${encodeURIComponent(templateId)}`);
  // SignWell may nest under `template` or return flat — normalize both.
  const src = (raw.template ?? raw) as Record<string, unknown>;
  return {
    id: String(src.id ?? templateId),
    name: String(src.name ?? ""),
    fields: (Array.isArray(src.fields) ? src.fields : []) as SignWellTemplateField[],
    placeholders: (Array.isArray(src.placeholders) ? src.placeholders : []) as SignWellTemplatePlaceholder[],
    created_at: typeof src.created_at === "string" ? src.created_at : undefined,
  };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface CreateDocumentFromTemplateInput {
  template_id: string;
  name?: string;                       // display name shown in SignWell
  subject?: string;                    // signer email subject
  message?: string;                    // signer email body
  recipients: Array<{
    placeholder_name: string;          // must match a template placeholder
    name: string;
    email: string;
  }>;
  template_fields?: Array<{
    api_id: string;
    value: string | boolean | number;
  }>;
  draft?: boolean;                     // false = send immediately
  test_mode?: boolean;
  metadata?: Record<string, string>;   // stored + echoed back on webhook
  redirect_url?: string;
  reminders?: boolean;
  expires_in?: number;                 // days
  embedded_signing?: boolean;
}

export interface SignWellDocument {
  id: string;
  status?: string;
  name?: string;
  recipients?: Array<{
    id?: string; email?: string; name?: string;
    placeholder_name?: string; status?: string;
  }>;
  files?: Array<{ name?: string; pages_number?: number }>;
  metadata?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
  test_mode?: boolean;
  embedded_edit_url?: string;
}

export async function createDocumentFromTemplate(input: CreateDocumentFromTemplateInput): Promise<SignWellDocument> {
  const body: Record<string, unknown> = { ...input };
  const appId = apiAppId();
  if (appId && body.api_application_id === undefined) body.api_application_id = appId;
  // Sensible defaults.
  if (body.draft === undefined) body.draft = false;
  if (body.reminders === undefined) body.reminders = true;

  const raw = await call<Record<string, unknown>>(
    "POST", "/document_templates/documents", body,
  );
  return normalizeDocument(raw);
}

export async function getDocument(documentId: string): Promise<SignWellDocument> {
  const raw = await call<Record<string, unknown>>(
    "GET", `/documents/${encodeURIComponent(documentId)}`,
  );
  return normalizeDocument(raw);
}

/**
 * Download the completed PDF as a Buffer. Only works once the document is in
 * a fully-signed state.
 */
export async function downloadCompletedPdf(documentId: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/documents/${encodeURIComponent(documentId)}/completed_pdf`, {
    method: "GET",
    headers: { "X-Api-Key": apiKey(), Accept: "application/pdf" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new SignWellError(res.status, `SignWell completed_pdf: ${text}`);
  }
  const arr = new Uint8Array(await res.arrayBuffer());
  return Buffer.from(arr);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await call("DELETE", `/documents/${encodeURIComponent(documentId)}`);
}

// ---------------------------------------------------------------------------
// Webhook payload → normalized status
// ---------------------------------------------------------------------------

/**
 * Map SignWell event names to the values we store in
 * `companies.agreement_status`. Events not listed here are ignored on our
 * side (but always 200-acked so SignWell stops retrying).
 */
export const EVENT_TO_STATUS: Record<string, string | null> = {
  document_sent: "sent",
  document_viewed: "viewed",
  document_signed: null,          // partial signature — don't flip status yet
  document_completed: "signed",   // all signers done
  document_declined: "declined",
  document_expired: "expired",
  document_deleted: "voided",
  document_canceled: "voided",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDocument(raw: Record<string, unknown>): SignWellDocument {
  const src = (raw.document ?? raw) as Record<string, unknown>;
  const recipients = Array.isArray(src.recipients) ? src.recipients as SignWellDocument["recipients"] : undefined;
  const files = Array.isArray(src.files) ? src.files as SignWellDocument["files"] : undefined;
  return {
    id: String(src.id ?? ""),
    status: typeof src.status === "string" ? src.status : undefined,
    name: typeof src.name === "string" ? src.name : undefined,
    recipients,
    files,
    metadata: (src.metadata ?? undefined) as Record<string, string> | undefined,
    created_at: typeof src.created_at === "string" ? src.created_at : undefined,
    updated_at: typeof src.updated_at === "string" ? src.updated_at : undefined,
    test_mode: typeof src.test_mode === "boolean" ? src.test_mode : undefined,
    embedded_edit_url: typeof src.embedded_edit_url === "string" ? src.embedded_edit_url : undefined,
  };
}
