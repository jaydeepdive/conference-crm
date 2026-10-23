"use client";
/**
 * Lightweight rich-text editor (no dependencies): bold, italic, underline,
 * text size, colour, lists, links, alignment, clear formatting.
 * Emits HTML via onChange; the server sanitizes before sending.
 */
import { useEffect, useRef } from "react";

const COLORS = ["#14120e", "#8f6f2a", "#c9a24b", "#b91c1c", "#1d4ed8", "#047857", "#6b7280"];
const SIZES: [string, string][] = [["2", "Small"], ["3", "Normal"], ["4", "Large"], ["5", "Larger"], ["6", "Huge"]];

export function RichTextEditor({ value, onChange, placeholder, minHeight = 240 }: {
  value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) ref.current.innerHTML = value;
  }, [value]);

  function cmd(name: string, arg?: string) {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(name, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  }
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep text selection when clicking toolbar
  const Btn = ({ label, title, onClick, cls = "" }: { label: React.ReactNode; title: string; onClick: () => void; cls?: string }) => (
    <button type="button" title={title} onMouseDown={keep} onClick={onClick}
      className={`h-9 min-w-9 border border-ink/15 bg-white px-2 text-sm text-ink hover:border-ink ${cls}`}>{label}</button>
  );

  return (
    <div className="border border-ink/20 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-ink/10 bg-utility/60 p-1.5">
        <Btn label={<b>B</b>} title="Bold" onClick={() => cmd("bold")} />
        <Btn label={<i>I</i>} title="Italic" onClick={() => cmd("italic")} />
        <Btn label={<u>U</u>} title="Underline" onClick={() => cmd("underline")} />
        <select title="Text size" defaultValue="" onMouseDown={e => e.stopPropagation()}
          onChange={e => { if (e.target.value) cmd("fontSize", e.target.value); e.target.value = ""; }}
          className="h-9 border border-ink/15 bg-white px-1 text-sm text-ink">
          <option value="" disabled>Size</option>
          {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="mx-1 h-6 w-px bg-ink/15" />
        {COLORS.map(c => (
          <button key={c} type="button" title={`Colour ${c}`} onMouseDown={keep} onClick={() => cmd("foreColor", c)}
            className="h-6 w-6 rounded-full border border-ink/20" style={{ backgroundColor: c }} />
        ))}
        <label title="Custom colour" className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-ink/20"
          style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" onChange={e => cmd("foreColor", e.target.value)} />
        </label>
        <span className="mx-1 h-6 w-px bg-ink/15" />
        <Btn label="• List" title="Bulleted list" onClick={() => cmd("insertUnorderedList")} />
        <Btn label="1. List" title="Numbered list" onClick={() => cmd("insertOrderedList")} />
        <Btn label="⇤" title="Align left" onClick={() => cmd("justifyLeft")} />
        <Btn label="↔" title="Centre" onClick={() => cmd("justifyCenter")} />
        <Btn label="🔗" title="Add link" onClick={() => {
          const url = prompt("Link address (https://…)", "https://");
          if (url && /^(https?:\/\/|mailto:)/i.test(url)) cmd("createLink", url);
        }} />
        <Btn label="Clear" title="Remove formatting" onClick={() => { cmd("removeFormat"); cmd("unlink"); }} cls="text-xs uppercase tracking-wider" />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={e => onChange((e.target as HTMLDivElement).innerHTML)}
        onPaste={e => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
        data-placeholder={placeholder}
        className="rte-body px-4 py-3 text-base text-ink outline-none [&_a]:text-[#8f6f2a] [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
        style={{ minHeight, lineHeight: 1.6 }}
      />
      <style>{`.rte-body:empty:before{content:attr(data-placeholder);color:#9a9a9a;white-space:pre-line}`}</style>
    </div>
  );
}
