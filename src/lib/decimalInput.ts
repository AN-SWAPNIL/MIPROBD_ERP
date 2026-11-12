export function isDecimalInput(value: string, scale: number) {
  return new RegExp(`^(0|[1-9]\\d{0,11})(\\.\\d{1,${scale}})?$`).test(value);
}

// In-progress/invalid controls must not reach Decimal constructors during rendering.
export function decimalPreview(value: string, scale = 8) {
  return isDecimalInput(value, scale) ? value : "0";
}
