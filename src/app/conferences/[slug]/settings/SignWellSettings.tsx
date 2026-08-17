"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Conference } from "@/lib/types";

/**
 * Conference-scoped SignWell configuration UI.
 *
 * Lets the operator:
 *   1. Pick which SignWell template represents this conference's participation
 *      agreement (list is fetched live from SignWell).
 *   2. Choose which placeholder role represents the signer (default "Signer 1").
 *   3. Map each semantic slot (Company name, Signer name, Signer email, etc.)
 *      to a specific template field. Only the mapped fields will be autofilled
 *      when we create a document.
 *
 * Saved values live on the `conferences` row: signwell_template_id,
 * signwell_placeholder_signer, and signwell_field_map (JSONB).
 */

type SwField = { api_id: string; name?: string; label?: string; type?: string; placeholder_name?: string };
type SwPlaceholder = { name: string };
type Template = { id: string; name: string; fields: SwField[]; placeholders: SwPlaceholder[] };
type Summary  = { id: string; name: string };

// Semantic slots the CRM knows how to autofill.
const SEMANTIC_SLOTS: { key: string; label: string; help: string; required?: boolean }[] = [
  { key: "company_name",      label: "Company name",     help: "Autofilled with the CRM company's name.", required: true },
  { key: "signer_name",       label: "Signer name",      help: "Autofilled with the company's contact_name." },
  { key: "signer_email",      label: "Signer email",     help: "Autofilled with the company's email." },
  { key: "signer_title",      label: "Signer title",     help: "Autofilled with contact_title if present." },
  { key: "conference_name",   label: "Conference name",  help: "Autofilled with the conference name." },
  { key: "conference_dates",  label: "Conference dates", help: "e.g. 2026-11-15 – 2026-11-17." },
];

export function SignWellSettings({ conference }: { conference: Conference }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Summary[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>(conference.signwell_template_id ?? "");
  const [template, setTemplate] = useState<Template | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [placeholderSigner, setPlaceholderSigner] = useState(
    conference.signwell_placeholder_signer ?? "Signer 1"
  );
  const [fieldMap, setFieldMap] = useState<Record<string, string>>(
    (conference.signwell_field_map ?? {}) as Record<string, string>
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load template list on mount
  useEffect(() => {
    (async () => {
      setLoadingList(true); setListError(null);
      try {
        const res = await fetch("/api/signwell/templates");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load SignWell templates");
        setTemplates(data.templates ?? []);
      } catch (e) {
        setListError(e instanceof Error ? e.message : String(e));
      } finally { setLoadingList(false); }
    })();
  }, []);

  // Load the selected template's fields whenever the selection changes
  useEffect(() => {
    if (!selectedId) { setTemplate(null); return; }
    (async () => {
      setLoadingTemplate(true);
      try {
        const res = await fetch(`/api/signwell/templates?id=${encodeURIComponent(selectedId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load template");
        setTemplate(data.template);
      } catch (e) {
        setListError(e instanceof Error ? e.message : String(e));
      } finally { setLoadingTemplate(false); }
    })();
  }, [selectedId]);

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
      {listError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {listError}
        </div>
      )}

      <div>
        <label className={label}>Template</label>
        {loadingList ? (
          <p className="mt-2 text-xs text-muted">Loading templates from SignWell…</p>
        ) : (
          <select className={`${input} mt-2`} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">— none —</option>
            {(templates ?? []).map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.id.slice(0,8)}…)</option>
            ))}
          </select>
        )}
        <p className="mt-1 text-xs text-muted">
          Only templates on your SignWell workspace are shown. Create the template in SignWell first, then pick it here.
        </p>
      </div>

      {selectedId && (
        <div>
          <label className={label}>Signer placeholder</label>
          <select className={`${input} mt-2`}
            value={placeholderSigner}
            onChange={e => setPlaceholderSigner(e.target.value)}
            disabled={loadingTemplate || !template}>
            {(template?.placeholders ?? [{ name: placeholderSigner }]).map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            The company's contact person is assigned to this template placeholder when we send.
          </p>
        </div>
      )}

      {selectedId && template && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className={label}>Field mapping</span>
            <span className="text-[10px] uppercase tracking-widest2 text-muted">
              {template.fields.length} field{template.fields.length === 1 ? "" : "s"} on this template
            </span>
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
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
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
