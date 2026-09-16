import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

export type PickedFile = { filename: string; mimeType: string; size: number; bytes: ArrayBuffer };

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Native returns bare base64; web's FileReader.readAsDataURL includes a "data:...;base64," prefix — normalize both to bare base64. Same helper as pdfPicker.ts. */
function stripDataUriPrefix(base64: string): string {
  const commaIndex = base64.indexOf(',');
  return commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;
}

function tooLarge(size: number): boolean {
  return size > MAX_ATTACHMENT_BYTES;
}

const TOO_LARGE = 'That file is too large — try one under 15MB.';
const UNREADABLE = 'Could not read that file — try a different one.';

/**
 * Opens the OS gallery for photos/videos — the grid people expect from
 * WhatsApp or Instagram, not the document browser, which is what
 * DocumentPicker shows even when filtered to image/*. Falls back to
 * pickDocument for anything that isn't media.
 */
export async function pickMedia(kind: 'image' | 'video'): Promise<{ file: PickedFile | null; error: string | null }> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { file: null, error: 'GroupMate needs permission to open your gallery.' };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'image' ? ['images'] : ['videos'],
    base64: true,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return { file: null, error: null };

  const asset = result.assets[0];
  if (!asset.base64) return { file: null, error: UNREADABLE };
  const size = asset.fileSize ?? 0;
  if (tooLarge(size)) return { file: null, error: TOO_LARGE };

  return {
    file: {
      filename: asset.fileName ?? `${kind}-${Date.now()}.${kind === 'image' ? 'jpg' : 'mp4'}`,
      mimeType: asset.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
      size,
      bytes: decode(stripDataUriPrefix(asset.base64)),
    },
    error: null,
  };
}

/** Opens the OS document browser, for files that aren't photos or video. `type` narrows what it offers (e.g. 'audio/*'). */
export async function pickDocument(type: string = '*/*'): Promise<{ file: PickedFile | null; error: string | null }> {
  const result = await DocumentPicker.getDocumentAsync({ base64: true, type });
  if (result.canceled || !result.assets?.[0]) return { file: null, error: null };
  const asset = result.assets[0];
  if (!asset.base64) return { file: null, error: UNREADABLE };
  if (tooLarge(asset.size ?? 0)) return { file: null, error: TOO_LARGE };
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
