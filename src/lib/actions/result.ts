export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; details?: string[] };

export function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
