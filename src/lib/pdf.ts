import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import React from "react";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Font registration.
//
// @react-pdf/renderer ships with "Helvetica" as a built-in Standard-14 font,
// but on Vercel's serverless runtime the AFM metric files for those built-in
// fonts don't always get bundled with the deployed function — the textkit
// layer then blows up with:
//   `Cannot read properties of undefined (reading 'unitsPerEm')`.
//
// CDN-hosted TTFs were unreliable (jsdelivr's @fontsource package only ships
// woff/woff2, not TTF, and fontkit rejects those as "Unknown font format").
//
// So we bundle Roboto Regular + Bold as TTF files inside /public/fonts/ and
// load them from the local filesystem at PDF-render time. next.config.mjs's
// `outputFileTracingIncludes` ensures they're packed into every serverless
// function that touches /api/**, so fs.readFileSync always finds them.
//
// Font data is read once at module init and cached in memory.
function loadFontAsDataUrl(filename: string): string {
  // process.cwd() is the project root in Node runtime — /var/task on Vercel.
  // @react-pdf's Font.register src field only accepts strings (URLs or data
  // URLs) — passing a Buffer trips `isDataUrl(src).split(...)`. So we read
  // the TTF once at module init and inline it as a base64 data URL. Adds
  // ~30% to the string size but is decoded once and cached in memory across
  // renders. Total for Regular + Bold is ~420 KB in RAM — fine.
  const buf = fs.readFileSync(path.join(process.cwd(), "public", "fonts", filename));
  return `data:font/ttf;base64,${buf.toString("base64")}`;
}

Font.register({
  family: "Roboto",
  fonts: [
    { src: loadFontAsDataUrl("Roboto-Regular.ttf"), fontWeight: 400 },
    { src: loadFontAsDataUrl("Roboto-Bold.ttf"),    fontWeight: 700 },
  ],
});
// Also disable hyphenation — another common textkit crash source.
Font.registerHyphenationCallback(word => [word]);

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Roboto", color: "#0E0E0E" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  brand: { fontSize: 20, fontFamily: "Roboto", fontWeight: 700, letterSpacing: 0.5 },
  brandSub: { fontSize: 9, color: "#666", marginTop: 4 },
  brandAddressLine: { fontSize: 9, color: "#444", marginTop: 2 },
  invoiceMeta: { textAlign: "right", fontSize: 10 },
  invoiceNumber: { fontSize: 18, fontFamily: "Roboto", fontWeight: 700 },
  section: { marginBottom: 18 },
  sectionLabel: { fontSize: 8, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  to: { fontSize: 11, fontFamily: "Roboto", fontWeight: 700 },
  toLine: { marginTop: 2 },
  table: { borderTop: "1pt solid #0E0E0E", borderBottom: "1pt solid #0E0E0E", marginTop: 12 },
  tableHeader: { flexDirection: "row", paddingVertical: 6, borderBottom: "0.5pt solid #999", fontSize: 8, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  tableRow: { flexDirection: "row", paddingVertical: 6, borderBottom: "0.5pt solid #ddd" },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1.5, textAlign: "right" },
  colAmount: { flex: 1.5, textAlign: "right" },
  totals: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totalsTable: { width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 10 },
  totalValue: { fontSize: 10, textAlign: "right" },
  grandRow: { borderTop: "1pt solid #0E0E0E", paddingTop: 6, marginTop: 6 },
  grandLabel: { fontSize: 12, fontFamily: "Roboto", fontWeight: 700 },
  grandValue: { fontSize: 12, fontFamily: "Roboto", fontWeight: 700, textAlign: "right" },
  payBlock: { marginTop: 22, padding: 12, backgroundColor: "#F5F5F5", border: "0.5pt solid #ddd" },
  payLine: { marginTop: 2, fontSize: 10 },
  footer: { marginTop: 22, paddingTop: 14, borderTop: "0.5pt solid #ddd", fontSize: 8, color: "#666" },
});

export interface InvoicePdfArgs {
  brand: {
    conferenceName: string;
    senderName: string;
    senderEmail: string;
    /** Legal name of the issuing corporation, e.g. "Bri-Sim Capital Inc." */
    issuerName?: string | null;
    /** Multi-line mailing address of the issuer */
    issuerAddress?: string | null;
    /** Multi-line payment instructions — wire details, ACH info, checks, etc. */
    paymentInstructions?: string | null;
  };
  invoice: {
    number: number;
    issued_date: string;
    due_date: string | null;
    currency: string;
    line_items: { description: string; quantity: number; unit_price: number }[];
    subtotal: number;
    discount_label: string | null;
    discount_amount: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    notes: string | null;
    payment_terms: string | null;
  };
  recipient: { name: string | null; email: string | null; organization: string };
}

export async function renderInvoicePdf(args: InvoicePdfArgs): Promise<Buffer> {
  const { brand, invoice, recipient } = args;

  const brandName = (brand.issuerName && brand.issuerName.trim()) || "MINING SUMMIT CRM";
  const addressLines = (brand.issuerAddress ?? "").split("\n").map(s => s.trim()).filter(Boolean);
  const payLines = (brand.paymentInstructions ?? "").split("\n").map(s => s.trim()).filter(Boolean);

  const doc = React.createElement(Document, {},
    React.createElement(Page, { size: "LETTER", style: styles.page },
      // Header — issuer name + address on the left; invoice meta on the right.
      // We deliberately do NOT print the internal conference name here — the
      // recipient is billed by the issuing corporation, not the event alias.
      React.createElement(View, { style: styles.header },
        React.createElement(View, {},
          React.createElement(Text, { style: styles.brand }, brandName),
          ...addressLines.map((line, i) =>
            React.createElement(Text, { key: `addr-${i}`, style: styles.brandAddressLine }, line)
          ),
        ),
        React.createElement(View, { style: styles.invoiceMeta },
          React.createElement(Text, { style: styles.invoiceNumber }, `Invoice #${invoice.number}`),
          React.createElement(Text, {}, `Issued: ${invoice.issued_date}`),
          invoice.due_date && React.createElement(Text, {}, `Due: ${invoice.due_date}`),
        ),
      ),
      // Bill to
      React.createElement(View, { style: styles.section },
        React.createElement(Text, { style: styles.sectionLabel }, "Bill to"),
        React.createElement(Text, { style: styles.to }, recipient.organization),
        recipient.name && React.createElement(Text, { style: styles.toLine }, recipient.name),
        recipient.email && React.createElement(Text, { style: styles.toLine }, recipient.email),
      ),
      // Line items
      React.createElement(View, { style: styles.table },
        React.createElement(View, { style: styles.tableHeader },
          React.createElement(Text, { style: styles.colDesc }, "Description"),
          React.createElement(Text, { style: styles.colQty }, "Qty"),
          React.createElement(Text, { style: styles.colPrice }, "Unit Price"),
          React.createElement(Text, { style: styles.colAmount }, "Amount"),
        ),
        ...invoice.line_items.map((li, i) =>
          React.createElement(View, { key: i, style: styles.tableRow },
            React.createElement(Text, { style: styles.colDesc }, li.description),
            React.createElement(Text, { style: styles.colQty }, String(li.quantity)),
            React.createElement(Text, { style: styles.colPrice }, fmt(li.unit_price, invoice.currency)),
            React.createElement(Text, { style: styles.colAmount }, fmt(li.quantity * li.unit_price, invoice.currency)),
          )
        ),
      ),
      // Totals
      React.createElement(View, { style: styles.totals },
        React.createElement(View, { style: styles.totalsTable },
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, "Subtotal"),
            React.createElement(Text, { style: styles.totalValue }, fmt(invoice.subtotal, invoice.currency)),
          ),
          invoice.discount_amount > 0 && React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, `− ${invoice.discount_label ?? "Discount"}`),
            React.createElement(Text, { style: styles.totalValue }, `−${fmt(invoice.discount_amount, invoice.currency)}`),
          ),
          invoice.tax_rate > 0 && React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, `Tax (${invoice.tax_rate.toFixed(1)}%)`),
            React.createElement(Text, { style: styles.totalValue }, fmt(invoice.tax_amount, invoice.currency)),
          ),
          React.createElement(View, { style: [styles.totalRow, styles.grandRow] },
            React.createElement(Text, { style: styles.grandLabel }, "Total Due"),
            React.createElement(Text, { style: styles.grandValue }, fmt(invoice.total, invoice.currency)),
          ),
        ),
      ),
      // Payment instructions — prominent grey box, always shown when configured
      payLines.length > 0 && React.createElement(View, { style: styles.payBlock },
        React.createElement(Text, { style: styles.sectionLabel }, "Payment instructions"),
        ...payLines.map((line, i) => React.createElement(Text, { key: `pay-${i}`, style: styles.payLine }, line)),
      ),
      // Notes + terms
      (invoice.notes || invoice.payment_terms) && React.createElement(View, { style: styles.footer },
        invoice.payment_terms && React.createElement(View, { style: { marginBottom: 6 } },
          React.createElement(Text, { style: styles.sectionLabel }, "Payment terms"),
          React.createElement(Text, {}, invoice.payment_terms),
        ),
        invoice.notes && React.createElement(View, {},
          React.createElement(Text, { style: styles.sectionLabel }, "Notes"),
          React.createElement(Text, {}, invoice.notes),
        ),
      ),
      // Sender footer
      React.createElement(View, { style: styles.footer },
        React.createElement(Text, {}, `Issued by ${brand.senderName} · ${brand.senderEmail}`),
      ),
    )
  );

  return await renderToBuffer(doc);
}

function fmt(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}

/** HTML invoice for the email body (renders inline in Gmail/Outlook). */
export function renderInvoiceHtml(args: InvoicePdfArgs): string {
  const { brand, invoice, recipient } = args;

  const brandName = (brand.issuerName && brand.issuerName.trim()) || "MINING SUMMIT CRM";
  const addressBlock = (brand.issuerAddress ?? "").trim()
    ? `<div style="color:#444;font-size:12px;margin-top:4px;white-space:pre-wrap">${esc((brand.issuerAddress ?? "").trim())}</div>`
    : "";
  const payBlock = (brand.paymentInstructions ?? "").trim()
    ? `<div style="margin-top:22px;padding:12px;background:#F5F5F5;border:1px solid #ddd">
        <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Payment instructions</div>
        <div style="font-size:12px;line-height:1.5;white-space:pre-wrap">${esc((brand.paymentInstructions ?? "").trim())}</div>
      </div>`
    : "";

  const items = invoice.line_items.map(li => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${esc(li.description)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${li.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmt(li.unit_price, invoice.currency)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmt(li.quantity * li.unit_price, invoice.currency)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;color:#0E0E0E;max-width:640px;margin:0 auto;padding:24px">
  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0E0E0E;padding-bottom:16px">
    <div>
      <div style="font-weight:bold;font-size:20px;letter-spacing:.5px">${esc(brandName)}</div>
      ${addressBlock}
    </div>
    <div style="text-align:right">
      <div style="font-weight:bold;font-size:18px">Invoice #${invoice.number}</div>
      <div style="font-size:12px">Issued: ${esc(invoice.issued_date)}</div>
      ${invoice.due_date ? `<div style="font-size:12px">Due: ${esc(invoice.due_date)}</div>` : ""}
    </div>
  </div>
  <div style="margin:24px 0">
    <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px">Bill to</div>
    <div style="font-weight:bold;margin-top:4px">${esc(recipient.organization)}</div>
    ${recipient.name ? `<div>${esc(recipient.name)}</div>` : ""}
    ${recipient.email ? `<div style="color:#666">${esc(recipient.email)}</div>` : ""}
  </div>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #0E0E0E;border-bottom:1px solid #0E0E0E">
    <thead>
      <tr style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px">
        <th style="text-align:left;padding:8px">Description</th>
        <th style="text-align:right;padding:8px">Qty</th>
        <th style="text-align:right;padding:8px">Unit Price</th>
        <th style="text-align:right;padding:8px">Amount</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>
  <table style="width:280px;margin-left:auto;margin-top:12px">
    <tr><td style="padding:4px">Subtotal</td><td style="padding:4px;text-align:right">${fmt(invoice.subtotal, invoice.currency)}</td></tr>
    ${invoice.discount_amount > 0 ? `<tr style="color:#C8102E"><td style="padding:4px">− ${esc(invoice.discount_label ?? "Discount")}</td><td style="padding:4px;text-align:right">−${fmt(invoice.discount_amount, invoice.currency)}</td></tr>` : ""}
    ${invoice.tax_rate > 0 ? `<tr><td style="padding:4px">Tax (${invoice.tax_rate.toFixed(1)}%)</td><td style="padding:4px;text-align:right">${fmt(invoice.tax_amount, invoice.currency)}</td></tr>` : ""}
    <tr style="border-top:1px solid #0E0E0E"><td style="padding:8px;font-weight:bold;font-size:14px">Total Due</td><td style="padding:8px;text-align:right;font-weight:bold;font-size:14px">${fmt(invoice.total, invoice.currency)}</td></tr>
  </table>
  ${payBlock}
  ${invoice.payment_terms ? `<div style="margin-top:16px;font-size:11px;color:#666"><b>Payment terms:</b> ${esc(invoice.payment_terms)}</div>` : ""}
  ${invoice.notes ? `<div style="margin-top:8px;font-size:11px;color:#666">${esc(invoice.notes)}</div>` : ""}
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#666">
    Issued by ${esc(brand.senderName)} · ${esc(brand.senderEmail)}
  </div>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
