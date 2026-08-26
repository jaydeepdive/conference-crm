"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Conference, SignWellTemplateConfig } from "@/lib/types";

/**
 * Conference-scoped SignWell configuration UI — multi-template edition.
 *
 * Each conference can hold N template configs (e.g. "Pricing A", "Pricing B").
 * Each config = { id, name, placeholder_signer, field_map } where:
 *   * id                 → SignWell template UUID (paste from editor URL)
 *   * name               → operator-facing label shown in the send picker
 *   * placeholder_signer → which template placeholder role is the recipient
 *   * field_map          → semantic slot → template field api_id
 *
 * Legacy single-template settings loaded via 0015 backfill just appear as
 * the first row of the list — nothing special.
 */

type SwField = { api_id: string; name?: string; label?: string; type?: string; placeholder_name?: string };
type SwPlaceholder = { name: string };
type LoadedTemplate = { id: string; name: string; fields: SwField[]; placeholders: SwPlaceholder[] };

// Semantic slots the CRM knows how to autofill.
const SEMANTIC_SLOTS: { key: string; label: string; help: string; required?: boolean }[] = [
  { key: "company_name",      label: "Company name",     help: "Autofilled with the CRM company's name.", required: true },
  { key: "signer_name",       label: "Signer name",      help: "Autofilled with contact_name (leave unmapped if you want the client to type it)." },
  { key: "signer_email",      label: "Signer email",     help: "Autofilled with company's email." },
  { key: "signer_title",      label: "Signer title",     help: "Autofilled with contact_title." },
  { key: "conference_name",   label: "Conference name",  help: "Autofilled with the conference name." },
  { key: "conference_dates",  label: "Conference dates", help: "e.g. 2026-11-15 – 2026-11-17." },
];

function extractTemplateId(input: string): { id?: string; error?: string } {
  const trimmed = input.trim().replace(/\/$/, "");
  if (!trimmed) return {};
  if (/\/new_doc\//.test(trimmed)) {
    return {
      error:
        "That's SignWell's public start-signing link, not the template ID. Open the template in the editor and copy the UUID from the URL (looks like /document_templates/<uuid>/edit or /template_builder/<uuid>).",
    };
  }
  const uuid = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return { id: uuid[0] };
  const looseHex = trimmed.match(/[0-9a-f]{20,}/i);
  if (looseHex) return { id: looseHex[0] };
  return {
    error:
      "That doesn't look like a template ID. Open the template in SignWell's editor and copy the UUID from the URL.",
  };
}

export function SignWellSettings({ conference }: { conference: Conference }) {
  const router = useRouter();

  // Seed from server row. If empty AND the legacy single-template columns
  // are populated, synthesize a first entry so the operator sees their
  // existing config in the new UI.
  const seed: SignWellTemplateConfig[] =
    (conference.signwell_templates && conference.signwell_templates.length > 0)
      ? conference.signwell_templates
      : (conference.signwell_template_id
          ? [{
              id: conference.signwell_template_id,
              name: "Default template",
              placeholder_signer: conference.signwell_placeholder_signer || "Signer 1",
              field_map: conference.signwell_field_map ?? {},
            }]
          : []);

  const [templates, setTemplates] = useState<SignWellTemplateConfig[]>(seed);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addBlank() {
    setTemplates([...templates, { id: "", name: "", placeholder_signer: "Signer 1", field_map: {} }]);
    setSaved(false);
  }

  function updateAt(i: number, patch: Partial<SignWellTemplateConfig>) {
    setTemplates(templates.map((t, idx) => idx === i ? { ...t, ...patch } : t));
    setSaved(false);
  }

  function removeAt(i: number) {
    if (!confirm("Remove this template from the conference? You can add it back later.")) return;
    setTemplates(templates.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    setSaving(true); setSaveError(null); setSaved(false);
    // Basic validation
    for (const t of templates) {
      if (!t.name.trim()) { setSaveError("Every template needs a name."); setSaving(false); return; }
      if (!t.id.trim())   { setSaveError(`Template "${t.name}" is missing its SignWell template ID.`); setSaving(false); return; }
      if (!t.field_map.company_name) {
        setSaveError(`Template "${t.name}" needs the Company name field mapped.`);
        setSaving(false); return;
      }
    }
    const supabase = createClient();
    const { error } = await supabase.from("conferences").update({
      signwell_templates: templates,
      // Keep the legacy columns roughly in sync with the first template so
      // nothing that still reads the old columns breaks.
      signwell_template_id:        templates[0]?.id ?? null,
      signwell_placeholder_signer: templates[0]?.placeholder_signer ?? "Signer 1",
      signwell_field_map:          templates[0]?.field_map ?? {},
    }).eq("id", conference.id);
    if (error) { setSaveError(error.message); setSaving(false); return; }
    setSaved(true); setSaving(false);
    router.refresh();
  }

  const persistedCount = (conference.signwell_templates ?? []).length ||
    (conference.signwell_template_id ? 1 : 0);
  const pendingCount = templates.length;
  const hasUnsavedChanges = pendingCount !== persistedCount || !saved;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-200 bg-white p-3 text-xs text-muted">
        <div>
          <strong className="text-ink">{persistedCount}</strong> template{persistedCount === 1 ? "" : "s"} currently saved to this conference
          {hasUnsavedChanges && (
            <span className="ml-2 text-amber-700">· {pendingCount} in editor (unsaved changes)</span>
          )}
        </div>
      </div>

      {templates.length === 0 && (
        <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-muted">
          No templates yet. Click <strong>Add template</strong> to configure your first one.
        </div>
      )}

      {templates.map((t, i) => (
        <TemplateEditor
          key={i}
          value={t}
          onChange={patch => updateAt(i, patch)}
          onRemove={() => removeAt(i)}
        />
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={addBlank}
          className="border border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-widest2 hover:bg-cream"
        >
          + Add template
        </button>
        <button
          onClick={save}
          disabled={saving}
          style={{ backgroundColor: "#C8102E", color: "#FFFFFF" }}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-widest2 hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save all templates"}
        </button>
        {saved && <span className="text-xs text-emerald-700">Saved.</span>}
        {saveError && <span className="text-xs text-rose-700">{saveError}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-template card. Owns its own load-fields state so multiple templates
// can be edited independently.
// ---------------------------------------------------------------------------
function TemplateEditor({
  value, onChange, onRemove,
}: {
  value: SignWellTemplateConfig;
  onChange: (patch: Partial<SignWellTemplateConfig>) => void;
  onRemove: () => void;
}) {
  const [rawInput, setRawInput] = useState<string>(value.id);
  const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Auto-load fields when we already know the id (e.g. on mount for existing templates)
  useEffect(() => {
    if (value.id && !loaded && !loading) loadTemplate(value.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTemplate(id: string) {
    setLoading(true); setLoadError(null);
    try {
      const res = await fetch(`/api/signwell/templates?id=${encodeURIComponent(id)}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`SignWell returned a non-JSON response (${res.status}). Double-check the template ID and API key.`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to load template (${res.status})`);
      setLoaded(data.template);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setLoaded(null);
    } finally { setLoading(false); }
  }

  function loadFromInput() {
    const { id, error } = extractTemplateId(rawInput);
    if (error) { setLoadError(error); setLoaded(null); return; }
    if (!id) { setLoadError("Enter a template ID first."); return; }
    onChange({ id });
    loadTemplate(id);
  }

  const input = "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-widest2 text-muted";

  return (
    <div className="space-y-4 rounded-md border border-gray-300 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className={label}>Label (shown in send picker)</label>
          <input
            className={`${input} mt-1`}
            placeholder="e.g. Pricing A"
            value={value.name}
            onChange={e => onChange({ name: e.target.value })}
          />
        </div>
        <button
          onClick={onRemove}
          className="mt-5 border border-rose-300 px-3 py-1.5 text-xs uppercase tracking-widest2 text-rose-700 hover:bg-rose-50"
          title="Remove this template"
        >
          Remove
        </button>
      </div>

      <div>
        <label className={label}>Template ID</label>
        <div className="mt-1 flex gap-2">
          <input
            className={input}
            placeholder="Paste template ID or SignWell URL"
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); loadFromInput(); } }}
          />
          <button
            onClick={loadFromInput}
            disabled={loading || !rawInput.trim()}
            className="whitespace-nowrap border border-gray-300 px-3 py-1.5 text-xs uppercase tracking-widest2 hover:bg-cream disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load fields"}
          </button>
        </div>
        {loadError && (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
            {loadError}
          </div>
        )}
        {loaded && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
            Loaded: <strong>{loaded.name}</strong> ({loaded.fields.length} field{loaded.fields.length === 1 ? "" : "s"}, {loaded.placeholders.length} placeholder{loaded.placeholders.length === 1 ? "" : "s"})
          </div>
        )}
      </div>

      {loaded && (
        <>
          <div>
            <label className={label}>Signer placeholder</label>
            {loaded.placeholders.length > 0 ? (
              <select className={`${input} mt-1`}
                value={value.placeholder_signer}
                onChange={e => onChange({ placeholder_signer: e.target.value })}>
                {loaded.placeholders.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            ) : (
              <input className={`${input} mt-1`}
                value={value.placeholder_signer}
                onChange={e => onChange({ placeholder_signer: e.target.value })}
                placeholder="Signer 1" />
            )}
          </div>

          <div>
            <div className={label}>Field mapping</div>
            <div className="mt-1 overflow-hidden rounded-md border border-gray-200">
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
                          value={value.field_map[slot.key] ?? ""}
                          onChange={e => onChange({ field_map: { ...value.field_map, [slot.key]: e.target.value } })}
                        >
                          <option value="">— not mapped —</option>
                          {loaded.fields
                            .filter(f => {
                              const t = (f.type ?? "").toLowerCase();
                              return t !== "signature" && t !== "initials";
                            })
                            .map(f => {
                              const displayLabel = f.label || f.name || f.api_id || "(unnamed field)";
                              const typeSuffix = f.type ? ` [${f.type}]` : "";
                              const placeholderSuffix = f.placeholder_name ? ` · ${f.placeholder_name}` : "";
                              return (
                                <option key={f.api_id} value={f.api_id}>
                                  {displayLabel}{typeSuffix}{placeholderSuffix}
                                </option>
                              );
                            })}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
