import * as DocumentPicker from 'expo-document-picker';
import { decode } from 'base64-arraybuffer';

export type PickedFile = { filename: string; mimeType: string; size: number; bytes: ArrayBuffer };

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Native returns bare base64; web's FileReader.readAsDataURL includes a "data:...;base64," prefix — normalize both to bare base64. Same helper as pdfPicker.ts. */
function stripDataUriPrefix(base64: string): string {
  const commaIndex = base64.indexOf(',');
  return commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;
}

/** Opens the OS file picker, validates size, and returns decoded bytes ready for a Supabase Storage upload. `type` narrows what the picker offers (e.g. 'image/*'). */
export async function pickFile(type: string = '*/*'): Promise<{ file: PickedFile | null; error: string | null }> {
  const result = await DocumentPicker.getDocumentAsync({ base64: true, type });
  if (result.canceled || !result.assets?.[0]) return { file: null, error: null };
  const asset = result.assets[0];
  if (!asset.base64) {
    return { file: null, error: 'Could not read that file — try a different one.' };
  }
  if ((asset.size ?? 0) > MAX_ATTACHMENT_BYTES) {
    return { file: null, error: 'That file is too large — try one under 15MB.' };
  }
  return {
    file: {
      filename: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? 0,
      bytes: decode(stripDataUriPrefix(asset.base64)),
    },
    error: null,
  };
}
