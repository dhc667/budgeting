// Made-up codes (not ISO 4217) that tests give rates to. They stay in public.currencies, and every
// first pull downloads them, so the global teardown deletes exactly these.
export const fakeCurrencyCodes = ["XSA", "XSB", "XSC", "XSD", "XSE", "XSF", "XPA", "XPB"] as const;

export type FakeCurrencyCode = (typeof fakeCurrencyCodes)[number];
