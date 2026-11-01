export const expiryBands = [
  { days: 31, status: "1 Month Alert" },
  { days: 92, status: "3 Month Alert" },
  { days: 183, status: "6 Month Alert" }
] as const;

export function expiryStatusAt(expiryDate: string, asOf: string) {
  const days = Math.ceil((Date.parse(expiryDate) - Date.parse(asOf)) / 86400000);
  return days < 0 ? "Expired" : expiryBands.find((band) => days <= band.days)?.status ?? "Normal";
}
