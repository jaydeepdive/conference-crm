"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Conference } from "@/lib/types";

/**
 * Conference-scoped SignWell configuration UI.
 *
 * SignWell's public API does NOT expose a list-templates endpoint, so the
 * operator has to paste the template ID by hand. It's a UUID visible in the
 * URL when editing the template on the SignWell dashboard, e.g.
 *   https://www.signwell.com/app/document_templates/<THIS_UUID>/edit
 *
 * Once a valid ID is entered we hit /api/signwell/templates?id=<id> to fetch
 * the template's fields + placeholders, and let the operator:
 *   - Pick which placeholder role represents the signer (default "Signer 1").
 *   - Map each semantic slot (Company name, Signer name, etc.) to a specific
 *     template field.
 *
 * Saved values live on the `conferences` row: signwell_template_id,
 * signwell_placeholder_signer, signwell_field_map (JSONB).
 */

type SwField = { api_id: string; name?: string; label?: string; type?: string; placeholder_name?: string };
type SwPlaceholder = { name: string };
type Template = { id: string; name: string; fields: SwField[]; placeholders: SwPlaceholder[] };

// Semantic slots the CRM knows how to autofill.
const SEMANTIC_SLOTS: { key: string; label: string; help: string; required?: boolean }[] = [
  { key: "company_name",      label: "Company name",     help: "Autofilled with the CRM company's name.", required: true },
  { key: "signer_name",       label: "Signer name",      help: "Autofilled with the company's contact_name." },
  { key: "signer_email",      label: "Signer email",     help: "Autofilled with the company's email." },
  { key: "signer_title",      label: "Signer title",     help: "Autofilled with contact_title if present." },
  { key: "conference_name",   label: "Conference name",  help: "Autofilled with the conference name." },
  { key: "conference_dates",  label: "Conference dates", help: "e.g. 2026-11-15 – 2026-11-17." },
];

/** Strip either a full SignWell URL or a UUID down to just the UUID. */
function extractTemplateId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const uuidMatch = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuidMatch ? uuidMatch[0] : trimmed;
}

export function SignWellSettings({ conference }: { conference: Conference }) {
  const router = useRouter();

  const [rawInput, setRawInput] = useState<string>(conference.signwell_template_id ?? "");
  const [selectedId, setSelectedId] = useState<string>(conference.signwell_template_id ?? "");
  const [template, setTemplate] = useState<Template | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [placeholderSigner, setPlaceholderSigner] = useState(
    conference.signwell_placeholder_signer ?? "Signer 1"
  );
  const [fieldMap, setFieldMap] = useState<Record<string, string>>(
    (conference.signwell_field_map ?? {}) as Record<string, string>
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load the template whenever selectedId changes.
  useEffect(() => {
    if (!selectedId) { setTemplate(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingTemplate(true); setLoadError(null);
      try {
        const res = await fetch(`/api/signwell/templates?id=${encodeURIComponent(selectedId)}`);
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(`SignWell returned a non-JSON response (${res.status}). Double-check the template ID and API key.`);
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Failed to load template (${res.status})`);
        if (!cancelled) setTemplate(data.template);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally { if (!cancelled) setLoadingTemplate(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  function loadTemplateFromInput() {
    const id = extractTemplateId(rawInput);
    setSelectedId(id);
    setSaved(false);
  }

  async function save() {
    setSaving(true); setSaveError(null); setSaved(false);
    const supabase = createClient();
    const { error } = await supabase.from("conferences").update({
      signwell_template_id: selectedId || null,
      signwell_placeholder_signer: placeholderSigner || "Signer 1",
      signwell_field_map: fieldMap,
    }).eq("id", conference.id);
    if (error) { setSaveError(error.message); setSaving(false); return; }
    setSaved(true); setSaving(false);
    router.refresh();
  }

  const input = "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-widest2 text-muted";

  return (
    <div className="space-y-6">
      <div>
        <label className={label}>Template ID</label>
        <div className="mt-2 flex gap-2">
          <input
            className={input}
            placeholder="Paste template ID or SignWell URL"
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); loadTemplateFromInput(); } }}
          />
          <button
            onClick={loadTemplateFromInput}
            disabled={loadingTemplate || !rawInput.trim()}
            className="whitespace-nowrap border border-gray-300 px-3 py-1.5 text-xs uppercase tracking-widest2 hover:bg-cream disabled:opacity-50"
          >
            {loadingTemplate ? "Loading…" : "Load fields"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          SignWell doesn&rsquo;t expose a template list. In SignWell, open the template &rarr;
          copy the ID from the URL (looks like <code className="rounded bg-cream px-1">/document_templates/&lt;uuid&gt;/edit</code>)
          and paste it here.
        </p>
        {loadError && (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
            {loadError}
          </div>
        )}
      </div>

      {template && (
        <>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            Loaded: <strong>{template.name}</strong> ({template.fields.length} field{template.fields.length === 1 ? "" : "s"}, {template.placeholders.length} placeholder{template.placeholders.length === 1 ? "" : "s"})
          </div>

          <div>
            <label className={label}>Signer placeholder</label>
            {template.placeholders.length > 0 ? (
              <select className={`${input} mt-2`}
                value={placeholderSigner}
                onChange={e => setPlaceholderSigner(e.target.value)}>
                {template.placeholders.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            ) : (
              <input className={`${input} mt-2`}
                value={placeholderSigner}
                onChange={e => setPlaceholderSigner(e.target.value)}
                placeholder="Signer 1" />
            )}
            <p className="mt-1 text-xs text-muted">
              The company&rsquo;s contact person is assigned to this placeholder when we send.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className={label}>Field mapping</span>
            </div>
            <div className="overflow-hidden rounded-md border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-cream text-left text-[10px] uppercase tracking-widest2 text-muted">
                  <tr>
                    <th className="px-3 py-2">CRM slot</th>
                    <th className="px-3 py-2">Template field</th>
                  </tr>
                </thead>
                <tbody>
                  {SEMANTIC_SLOTS.map(slot => (
                    <tr key={slot.key} className="border-t border-gray-100">
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{slot.label}{slot.required && <span className="text-rose-500"> *</span>}</div>
                        <div className="text-xs text-muted">{slot.help}</div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className={input}
                          value={fieldMap[slot.key] ?? ""}
                          onChange={e => setFieldMap({ ...fieldMap, [slot.key]: e.target.value })}
                        >
                          <option value="">— not mapped —</option>
                          {template.fields
                            .filter(f => f.type !== "signature" && f.type !== "initials")
                            .map(f => (
                              <option key={f.api_id} value={f.api_id}>
                                {(f.label || f.name || f.api_id)}{f.placeholder_name ? ` · ${f.placeholder_name}` : ""}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Only text-type fields are shown. Signature and initials fields are always filled by the signer, not by the CRM.
            </p>
          </div>
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !selectedId}
          style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save SignWell settings"}
        </button>
        {saved && <span className="text-xs text-emerald-700">Saved.</span>}
        {saveError && <span className="text-xs text-rose-700">{saveError}</span>}
      </div>
    </div>
  );
}
