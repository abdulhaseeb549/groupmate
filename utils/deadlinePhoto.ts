import * as ImagePicker from 'expo-image-picker';
import { encode } from 'base64-arraybuffer';
import { readPickedBytes } from './filePicker';

export type DeadlinePhoto = { base64: string; mimeType: string };

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A notice board photo or a screenshot for parse-deadline. Quality is kept
 * modest: dates on a notice board read fine at 0.7, and a smaller upload
 * is faster on a college network.
 */
export async function getDeadlinePhoto(
  from: 'camera' | 'gallery'
): Promise<{ photo: DeadlinePhoto | null; error: string | null }> {
  const permission =
    from === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      photo: null,
      error: from === 'camera' ? 'GroupMate needs the camera to read a notice.' : 'GroupMate needs your photos to read a screenshot.',
    };
  }

  const options: ImagePicker.ImagePickerOptions = { base64: true, quality: 0.7, mediaTypes: ['images'] };
  const result =
    from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return { photo: null, error: null };
  const asset = result.assets[0];
  if ((asset.fileSize ?? 0) > MAX_BYTES) return { photo: null, error: 'That picture is too large. Try another.' };

  const bytes = await readPickedBytes(asset);
  if (!bytes) return { photo: null, error: 'Could not read that picture. Try again.' };
  return { photo: { base64: encode(bytes), mimeType: asset.mimeType ?? 'image/jpeg' }, error: null };
}
