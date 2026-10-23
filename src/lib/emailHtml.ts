/**
 * Whitelist sanitizer for admin-authored rich-text email bodies (from the
 * console Emails editor). Keeps simple formatting only: bold/italic/underline,
 * size, colour, alignment, lists, headings and http(s)/mailto links.
 */
const ALLOWED = new Set(["b", "strong", "i", "em", "u", "br", "p", "div", "span", "font", "ul", "ol", "li", "a", "h1", "h2", "h3", "blockquote"]);
const STYLE_PROPS = new Set(["color", "font-size", "font-weight", "font-style", "text-decoration", "text-align", "background-color"]);
const FONT_SIZES: Record<string, string> = { "1": "12px", "2": "13px", "3": "16px", "4": "18px", "5": "24px", "6": "32px", "7": "40px" };

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : null;
}

function cleanStyle(style: string): string {
  return style.split(";").map(d => d.trim()).filter(Boolean).map(d => {
    const i = d.indexOf(":"); if (i < 0) return "";
    const prop = d.slice(0, i).trim().toLowerCase();
    const val = d.slice(i + 1).trim();
    if (!STYLE_PROPS.has(prop)) return "";
    if (/url\(|expression|javascript:|[<>"]/i.test(val)) return "";
    return `${prop}:${val}`;
  }).filter(Boolean).join(";");
}

export function sanitizeEmailHtml(input: string): string {
  let s = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|head|title|meta|link)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|meta|link)[^>]*\/?>/gi, "");
  s = s.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, close: string, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED.has(tag)) return "";
    if (tag === "font") {
      if (close) return "</span>";
      const st: string[] = [];
      const size = attr(attrs, "size"); if (size && FONT_SIZES[size]) st.push(`font-size:${FONT_SIZES[size]}`);
      const color = attr(attrs, "color"); if (color && /^#?[0-9a-z(),.\s%]+$/i.test(color)) st.push(`color:${color}`);
      const style = attr(attrs, "style"); if (style) { const c = cleanStyle(style); if (c) st.push(c); }
      return st.length ? `<span style="${st.join(";")}">` : "<span>";
    }
    if (close) return `</${tag}>`;
    if (tag === "br") return "<br>";
    const parts: string[] = [];
    const style = attr(attrs, "style");
    if (style) { const c = cleanStyle(style); if (c) parts.push(`style="${c}"`); }
    if (tag === "a") {
      const href = attr(attrs, "href") ?? "";
      if (/^(https?:|mailto:)/i.test(href.trim())) parts.push(`href="${href.trim().replace(/"/g, "%22")}"`, `target="_blank"`);
      if (!/color/.test(style ?? "")) parts.push(`style="color:#8f6f2a;${style ? cleanStyle(style) : ""}"`.replace(/;"/, '"'));
    }
    return `<${tag}${parts.length ? " " + parts.join(" ") : ""}>`;
  });
  return s.trim();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|blockquote)>/gi, "\n")
    .replace(/<(p|div|h1|h2|h3|blockquote)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}
