import { LIMITS } from "@/lib/validation";

/**
 * Ridimensiona una foto nel browser prima del caricamento (max 800 px, JPEG):
 * file piccoli, caricamenti veloci e meno spazio occupato nel piano gratuito.
 */
export async function resizeImage(file: File, maxSize = 800, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas non disponibile");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversione non riuscita"))), "image/jpeg", quality),
    );
  } finally {
    bitmap.close();
  }
}

/**
 * Prepara un form con un campo "photo" per l'invio: ridimensiona la foto e
 * mantiene gli altri campi. Una stringa è un messaggio d'errore per l'utente.
 */
export async function preparePhotoField(
  formData: FormData,
  { required, maxSize }: { required: boolean; maxSize?: number },
): Promise<FormData | string> {
  const file = formData.get("photo");
  const prepared = new FormData();
  for (const [key, value] of formData) if (key !== "photo") prepared.append(key, value);
  if (!(file instanceof File) || file.size === 0) return required ? "Seleziona una fotografia." : prepared;
  if (!file.type.startsWith("image/")) return "Il file selezionato non è un'immagine.";
  try {
    const resized = await resizeImage(file, maxSize);
    if (resized.size > LIMITS.photoBytes) return "La fotografia è troppo grande anche dopo il ridimensionamento.";
    prepared.set("photo", resized, "foto.jpg");
    return prepared;
  } catch {
    return "Impossibile leggere questa immagine: prova con un file JPEG o PNG.";
  }
}
