export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

export function currencyName(code: string): string {
  return new Intl.DisplayNames(undefined, { type: "currency" }).of(code) ?? code;
}
