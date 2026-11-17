import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { encode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import { readPickedBytes } from './filePicker';
import { blobSource, PdfSource } from './pdfReader/reader';

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

// ---------------------------------------------------------------------------
// Study (14 Nov): any size. The PDF stays on the phone; the reader takes the
// pages it needs straight from the file (see utils/pdfReader).
// ---------------------------------------------------------------------------

/** Biggest study PDF we accept. Whole textbooks are a few hundred MB at most. */
export const MAX_STUDY_PDF_BYTES = 500 * 1024 * 1024;

export type PickedStudyPdf = {
  name: string;
  size: number;
  source: PdfSource;
  /** The whole file as base64, for the old send-the-PDF path when the reader can't start. Null over 15 MB. */
  readAll: () => Promise<PdfFileInput | null>;
};

type Handle = { offset: number | null; readBytes: (n: number) => Uint8Array; close: () => void };

/** A file on the phone as a reader source: reads only the byte ranges asked for. */
function fileSource(uri: string, size: number): PdfSource {
  let handle: Handle | null = null;
  try {
    handle = (new File(uri) as unknown as { open: () => Handle }).open();
  } catch {
    handle = null;
  }
  return {
    size,
    read: async (begin, end) => {
      if (handle) {
        try {
          handle.offset = begin;
          const bytes = handle.readBytes(end - begin);
          return encode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        } catch {
          handle = null; // fall through to the slower reader below
        }
      }
      return LegacyFileSystem.readAsStringAsync(uri, {
        encoding: LegacyFileSystem.EncodingType.Base64,
        position: begin,
        length: end - begin,
      });
    },
    close: () => {
      try {
        handle?.close();
      } catch {
        // already closed
      }
      handle = null;
    },
  };
}

export async function pickStudyPdf(): Promise<{ pdf: PickedStudyPdf | null; error: string | null }> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return { pdf: null, error: null };
  const asset = result.assets[0];
  const webFile = Platform.OS === 'web' ? (asset as { file?: Blob }).file : undefined;
  const size = asset.size ?? webFile?.size ?? 0;
  if (size > MAX_STUDY_PDF_BYTES) {
    return { pdf: null, error: 'That PDF is over 500 MB. Try a smaller copy, or split the book into parts.' };
  }
  if (size <= 0) return { pdf: null, error: 'Could not read that PDF — try a different file.' };

  const source = webFile ? blobSource(webFile) : fileSource(asset.uri, size);
  return {
    pdf: {
      name: asset.name,
      size,
      source,
      readAll: async () => {
        if (size > MAX_PDF_BYTES) return null;
        const bytes = webFile ? await webFile.arrayBuffer() : await readPickedBytes({ uri: asset.uri });
        return bytes ? { filename: asset.name, base64: encode(bytes) } : null;
      },
    },
    error: null,
  };
}
