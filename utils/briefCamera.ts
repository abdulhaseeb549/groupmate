import * as ImagePicker from 'expo-image-picker';
import { encode } from 'base64-arraybuffer';
import { readPickedBytes } from './filePicker';

export type BriefPhotoInput = { filename: string; base64: string; mimeType: string };

export const MAX_BRIEF_PHOTO_BYTES = 15 * 1024 * 1024;

/** Opens the camera to photograph a printed brief — the other way to attach one, alongside a PDF. */
export async function captureBriefPhoto(): Promise<{ file: BriefPhotoInput | null; error: string | null }> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { file: null, error: 'GroupMate needs camera permission to photograph the brief.' };
  }

  const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return { file: null, error: null };
  const asset = result.assets[0];

  if ((asset.fileSize ?? 0) > MAX_BRIEF_PHOTO_BYTES) {
    return { file: null, error: 'That photo is too large — try again.' };
  }

  const bytes = await readPickedBytes(asset);
  if (!bytes) {
    return { file: null, error: 'Could not read that photo — try again.' };
  }
  return {
    file: {
      filename: asset.fileName ?? `brief-${Date.now()}.jpg`,
      base64: encode(bytes),
      mimeType: asset.mimeType ?? 'image/jpeg',
    },
    error: null,
  };
}
