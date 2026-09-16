import * as DocumentPicker from 'expo-document-picker';
import { encode } from 'base64-arraybuffer';
import { readPickedBytes } from './filePicker';

export type PdfFileInput = { filename: string; base64: string };

export const MAX_PDF_BYTES = 15 * 1024 * 1024;

/**
 * Opens the OS file picker for a PDF, validates size, and returns bare
 * base64 ready for an Edge Function call. Bytes come through
 * readPickedBytes rather than the asset's own base64 field, which
 * DocumentPicker only fills on web — see there.
 */
export async function pickPdf(): Promise<{ file: PdfFileInput | null; error: string | null }> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', base64: true });
  if (result.canceled || !result.assets?.[0]) return { file: null, error: null };
  const asset = result.assets[0];
  if ((asset.size ?? 0) > MAX_PDF_BYTES) {
    return { file: null, error: 'That PDF is too large — try one under 15MB.' };
  }

  const bytes = await readPickedBytes(asset);
  if (!bytes) {
    return { file: null, error: 'Could not read that PDF — try a different file.' };
  }
  return { file: { filename: asset.name, base64: encode(bytes) }, error: null };
}
