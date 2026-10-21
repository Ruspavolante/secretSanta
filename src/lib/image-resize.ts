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
