/**
 * The Deep Dive AdsPlatform — client lookup.
 * Single wrapper around the conference/lookup endpoint. Fail-open: if anything goes wrong,
 * we return is_client=false so checkout/invoice creation never breaks.
 */

export type AdsPlatformMatchType = "ticker" | "domain" | "name_exact" | "name_fuzzy" | "none";

export interface AdsPlatformCompany {
  id: number;
  name: string;
  ticker: string;
  exchange: string;
  website: string;
  status: string;
  slug: string;
}

export interface AdsPlatformLookupResult {
  is_client: boolean;
  match_type: AdsPlatformMatchType;
  company: AdsPlatformCompany | null;
  /** Set when our wrapper itself failed (timeout, network, bad status, etc.). Server-side responses set this to undefined. */
  error?: string;
}

export interface AdsPlatformLookupInput {
  ticker?: string | null;
  company_name?: string | null;
  website_url?: string | null;
}

const FALLBACK: AdsPlatformLookupResult = { is_client: false, match_type: "none", company: null };

export async function checkIsClientSponsor(input: AdsPlatformLookupInput): Promise<AdsPlatformLookupResult> {
  const endpoint = process.env.ADSPLATFORM_LOOKUP_URL;
  const apiKey = process.env.ADSPLATFORM_API_KEY;
  if (!endpoint || !apiKey) {
    return { ...FALLBACK, error: "ADSPLATFORM_LOOKUP_URL or ADSPLATFORM_API_KEY not configured" };
  }

  // Build body with only non-empty values so the server doesn't see "ticker=" and skip fallback fields.
  const body: Record<string, string> = {};
  if (input.ticker && input.ticker.trim()) body.ticker = input.ticker.trim();
  if (input.company_name && input.company_name.trim()) body.company_name = input.company_name.trim();
  if (input.website_url && input.website_url.trim()) body.website_url = input.website_url.trim();
  if (Object.keys(body).length === 0) return FALLBACK;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AdsPlatform-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn("[adsplatform] lookup failed", { status: resp.status, body });
      // 401/503 are setup errors — surface them so operator knows
      if (resp.status === 401 || resp.status === 503) {
        return { ...FALLBACK, error: `AdsPlatform setup error: HTTP ${resp.status}` };
      }
      return FALLBACK;
    }
    const json = await resp.json() as AdsPlatformLookupResult;
    if (typeof json.is_client !== "boolean") {
      console.warn("[adsplatform] malformed response", json);
      return FALLBACK;
    }
    return json;
  } catch (err) {
    clearTimeout(timeout);
    console.warn("[adsplatform] lookup error", err);
    return { ...FALLBACK, error: err instanceof Error ? err.message : "network error" };
  }
}

/**
 * Compute the dollar discount for a TDD-client invoice based on the conference's default config.
 * Returns 0 if the discount value is 0 or negative.
 */
export function computeClientDiscount(
  subtotal: number,
  conferenceConfig: { client_discount_type: "percent" | "fixed"; client_discount_value: number }
): number {
  const v = Number(conferenceConfig.client_discount_value);
  if (!v || v <= 0) return 0;
  if (conferenceConfig.client_discount_type === "percent") {
    return Math.min(subtotal, (subtotal * v) / 100);
  }
  return Math.min(subtotal, v);
}
