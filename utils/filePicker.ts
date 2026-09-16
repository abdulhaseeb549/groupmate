import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

export type PickedFile = { filename: string; mimeType: string; size: number; bytes: ArrayBuffer };

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Web's FileReader.readAsDataURL includes a "data:...;base64," prefix — strip it to bare base64. */
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
 * A picked asset's bytes, whichever picker it came from.
 *
 * Neither picker can be trusted to hand back base64 on a phone:
 * DocumentPicker fills it on web only, and ImagePicker never fills it for
 * video. Relying on it is why every PDF, file and video picked on Android
 * failed with "Could not read…" while the web preview — the only place any
 * of this had been tried — worked. Both pickers leave a readable copy at
 * `uri`, so that is the path on native; base64 stays the fast path on web,
 * where it is always present.
 */
export async function readPickedBytes(asset: { base64?: string | null; uri: string }): Promise<ArrayBuffer | null> {
  if (asset.base64) return decode(stripDataUriPrefix(asset.base64));
  try {
    return await new File(asset.uri).arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Opens the OS gallery for photos/videos — the grid people expect from
 * WhatsApp or Instagram, not the document browser, which is what
 * DocumentPicker shows even when filtered to image/*.
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
  // Checked before reading, so an oversized video is refused without first
  // being loaded into memory.
  const size = asset.fileSize ?? 0;
  if (tooLarge(size)) return { file: null, error: TOO_LARGE };

  const bytes = await readPickedBytes(asset);
  if (!bytes) return { file: null, error: UNREADABLE };

  return {
    file: {
      filename: asset.fileName ?? `${kind}-${Date.now()}.${kind === 'image' ? 'jpg' : 'mp4'}`,
      mimeType: asset.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
      size: size || bytes.byteLength,
      bytes,
    },
    error: null,
  };
}

/** Opens the OS document browser, for files that aren't photos or video. `type` narrows what it offers (e.g. 'audio/*'). */
export async function pickDocument(type: string = '*/*'): Promise<{ file: PickedFile | null; error: string | null }> {
  const result = await DocumentPicker.getDocumentAsync({ base64: true, type });
  if (result.canceled || !result.assets?.[0]) return { file: null, error: null };
  const asset = result.assets[0];
  if (tooLarge(asset.size ?? 0)) return { file: null, error: TOO_LARGE };

  const bytes = await readPickedBytes(asset);
  if (!bytes) return { file: null, error: UNREADABLE };

  return {
    file: {
      filename: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? bytes.byteLength,
      bytes,
    },
    error: null,
  };
}
