import { money } from "@/platform/country/tenant";

/**
 * Money in the signed-in pharmacy's operating currency ("US$12.50" for the
 * Liberian pilots, "GH₵12.50" in Ghana). `d` caps the fraction digits and
 * never exceeds the currency's own (RWF has none).
 */
export const fmt = (n: number, d = 2) => money(n, { digits: d });

/** Compact form for tight spaces: "US$1.2k". */
export const fmtK = (n: number) => money(n, { compact: true, digits: 0 });
