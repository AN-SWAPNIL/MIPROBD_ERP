export const productUnits = ["Piece", "Unit", "Pcs", "Set", "Pair", "Box", "Pack", "Packet", "Carton", "Case", "Bag", "Bottle", "Vial", "Ampoule", "Syringe", "Tube", "Roll", "Sheet", "Kit", "Dozen", "Kg", "Gram", "Litre", "mL", "Metre", "cm"];
export const currencies = ["USD", "BDT", "CNY", "EUR", "GBP", "JPY", "INR", "SGD", "HKD", "AED", "SAR", "KRW", "AUD", "CAD", "CHF", "MYR", "THB", "TRY"];
export const imageLimit = 1_000_000;
export const imageAccept = "image/jpeg,image/png,image/webp";
export function validateProductImage(file: Pick<File, "size" | "type">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size <= 0 || file.size >= imageLimit) throw new Error("Image must be smaller than 1 MB (1,000,000 bytes).");
}
