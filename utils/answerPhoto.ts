import * as ImagePicker from 'expo-image-picker';
import { encode } from 'base64-arraybuffer';
import { readPickedBytes } from './filePicker';

export type AnswerPhoto = { base64: string; uri: string };

/**
 * A photo of an answer written on paper. Quality 0.5 keeps handwriting
 * readable for the AI while a phone-camera shot stays near 1 MB.
 */
export async function getAnswerPhoto(): Promise<{ photo: AnswerPhoto | null; error: string | null }> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { photo: null, error: 'GroupMate needs the camera to read your page.' };
  }
  const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, mediaTypes: ['images'] });
  if (result.canceled || !result.assets?.[0]) return { photo: null, error: null };
  const asset = result.assets[0];
  const bytes = await readPickedBytes(asset);
  if (!bytes) return { photo: null, error: 'Could not read that photo. Try again.' };
  const base64 = encode(bytes);
  if (base64.length > 6_500_000) {
    return { photo: null, error: 'That photo is too large. Take it again from a little further away.' };
  }
  return { photo: { base64, uri: asset.uri }, error: null };
}
