import { apiRequest } from "../../lib/api/client";
import { validateProductImage } from "./options";

export async function uploadProductImage(file: File) {
  validateProductImage(file);
  const { data } = await apiRequest<{ id: string; signedUrl: string }>("/api/uploads", {
    method: "POST", body: JSON.stringify({ purpose: "product-image", fileName: file.name, mimeType: file.type, sizeBytes: file.size })
  });
  const response = await fetch(data.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!response.ok) throw new Error("Product image could not be uploaded. Check your connection and select it again.");
  await apiRequest(`/api/uploads/${data.id}/complete`, { method: "POST", body: "{}" });
  return `/api/documents/${data.id}`;
}
