import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

export interface DraftContext {
  conference: { name: string; date_start?: string | null; date_end?: string | null };
  recipient: { name?: string; email?: string; lead_type?: "company" | "investor"; lead_name?: string };
  template?: { subject: string; body: string; kind: string } | null;
  invoice?: {
    invoice_number: number;
    total: number; currency: string;
    due_date?: string | null;
    line_items: { description: string; quantity: number; unit_price: number }[];
  } | null;
  sender: { name?: string; email: string };
  user_intent: string; // free text from the operator
}

export interface DraftResult {
  subject: string;
  body: string;
}

export async function generateEmailDraft(ctx: DraftContext): Promise<DraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are an expert business email writer for a professional conference recruitment team. Write concise, warm, professional emails (60–150 words for typical messages, longer for invoices). Address the recipient by name. Sign off with the sender's name. Output strict JSON: {"subject": "...", "body": "..."}. No markdown, no preamble, no commentary — only the JSON.`;

  const userPrompt = buildUserPrompt(ctx);

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = resp.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map(b => b.text).join("");

  // Extract JSON from the response (model should output pure JSON)
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("AI response did not contain valid JSON");
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
    throw new Error("AI response missing subject or body");
  }
  return { subject: parsed.subject, body: parsed.body };
}

function buildUserPrompt(ctx: DraftContext): string {
  const parts: string[] = [];
  parts.push(`# Conference\n${ctx.conference.name}`);
  if (ctx.conference.date_start) {
    parts.push(`Dates: ${ctx.conference.date_start}${ctx.conference.date_end ? ` – ${ctx.conference.date_end}` : ""}`);
  }
  parts.push(`\n# Sender\n${ctx.sender.name ?? ctx.sender.email} <${ctx.sender.email}>`);
  parts.push(`\n# Recipient`);
  if (ctx.recipient.lead_name) parts.push(`Organization: ${ctx.recipient.lead_name} (${ctx.recipient.lead_type})`);
  if (ctx.recipient.name) parts.push(`Contact: ${ctx.recipient.name}`);
  if (ctx.recipient.email) parts.push(`Email: ${ctx.recipient.email}`);

  if (ctx.template) {
    parts.push(`\n# Template to adapt\nKind: ${ctx.template.kind}\nSubject: ${ctx.template.subject}\n\n${ctx.template.body}`);
  }

  if (ctx.invoice) {
    // Deliberately do NOT include the invoice number — the recipient
    // doesn't care and referencing "invoice #N" implies a running series.
    parts.push(`\n# Invoice context`);
    parts.push(`Total: ${ctx.invoice.currency} ${ctx.invoice.total.toFixed(2)}`);
    parts.push(ctx.invoice.due_date ? `Due: ${ctx.invoice.due_date}` : `Due: upon receipt`);
    if (ctx.invoice.line_items.length) {
      parts.push(`Line items:`);
      ctx.invoice.line_items.forEach(li => {
        parts.push(`  - ${li.description}: ${li.quantity} × ${ctx.invoice!.currency} ${li.unit_price.toFixed(2)}`);
      });
    }
    parts.push(`Do NOT reference an invoice number in the body — the recipient doesn't need it.`);
  }

  parts.push(`\n# What the operator wants this email to do\n${ctx.user_intent}`);
  parts.push(`\n# Task\nWrite a polished email. Replace any template variables ({{...}}) with real data from above. If a value isn't available, omit the variable gracefully. Return strict JSON {"subject":"...","body":"..."} with plain text body (line breaks OK, no HTML, no markdown).`);

  return parts.join("\n");
}
