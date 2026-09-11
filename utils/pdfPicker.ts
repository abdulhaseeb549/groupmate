import * as DocumentPicker from 'expo-document-picker';

export type PdfFileInput = { filename: string; base64: string };

export const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** Native returns bare base64; web's FileReader.readAsDataURL includes a "data:...;base64," prefix — normalize both to bare base64. */
function stripDataUriPrefix(base64: string): string {
  const commaIndex = base64.indexOf(',');
  return commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;
}

/** Opens the OS file picker for a PDF, validates size, and returns bare base64 ready for an Edge Function call. */
export async function pickPdf(): Promise<{ file: PdfFileInput | null; error: string | null }> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', base64: true });
  if (result.canceled || !result.assets?.[0]) return { file: null, error: null };
  const asset = result.assets[0];
  if (!asset.base64) {
    return { file: null, error: 'Could not read that PDF — try a different file.' };
  }
  if ((asset.size ?? 0) > MAX_PDF_BYTES) {
    return { file: null, error: 'That PDF is too large — try one under 15MB.' };
  }
  return { file: { filename: asset.name, base64: stripDataUriPrefix(asset.base64) }, error: null };
}
