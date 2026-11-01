import type { VisitPosition } from "./visitContracts";

export const visitPhotoLimit = 300 * 1024;
export async function compressVisitPhoto(source: Blob): Promise<File> {
  if (source.size > 20 * 1024 * 1024) throw new Error("Choose a photo smaller than 20 MB.");
  const bitmap = await createImageBitmap(source);
  try {
    if(Math.min(bitmap.width,bitmap.height)<16)throw new Error("Photo is too small or the camera frame is not ready. Retake it after the preview appears.");
    for (const edge of [960, 800, 640, 480]) {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.75, 0.6, 0.45]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (blob && blob.size <= visitPhotoLimit && ["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
          return new File([blob], `visit.${blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type });
        }
      }
    }
    throw new Error("Photo could not fit the 300 KB limit. Take a simpler photo or use the no-photo exception.");
  } finally { bitmap.close(); }
}

export function freshVisitPosition(): Promise<VisitPosition> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) { reject(new Error("Location requires HTTPS and browser location support.")); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, capturedAt: new Date(p.timestamp).toISOString() }), (error) => reject(new Error(error.code === 1 ? "Location permission was denied. Allow access or explain the exception." : error.code === 3 ? "Location timed out. Retry outdoors or explain the exception." : "Location is unavailable. Retry or explain the exception.")), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  });
}
