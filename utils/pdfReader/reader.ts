/**
 * Talks to the on-phone PDF reader (engine.ts) running in <PdfReaderHost>.
 *
 *   const info = await pdfReader.open(source);          // pages, chapters, scanned?
 *   const out = await pdfReader.extract(45, 98, opts);  // text, scans, figures
 *
 * One reader, one open PDF at a time. The host component registers how to
 * deliver a message (WebView injectJavaScript, or iframe postMessage) and
 * passes every message from the reader to receive().
 */
import { encode } from 'base64-arraybuffer';

export type Chapter = { title: string; page: number };
export type ReaderInfo = { pages: number; outline: Chapter[]; scanned: boolean };
export type ReadPage = { n: number; text: string };
export type ReadScan = { page: number; data: string };
export type ReadFigure = { id: string; page: number; data: string; w: number; h: number };
export type ReaderOutput = { pages: ReadPage[]; scans: ReadScan[]; scansSkipped: number; figures: ReadFigure[] };
export type ReaderProgress = { stage: 'text' | 'figures'; done: number; total: number };

/** Where the reader gets the file's bytes from, a range at a time. */
export type PdfSource = {
  size: number;
  /** Bytes [begin, end) as base64. */
  read: (begin: number, end: number) => Promise<string>;
  close?: () => void;
};

export type ReaderErrorCode = 'offline' | 'password' | 'broken' | 'failed' | 'timeout';
export class ReaderError extends Error {
  constructor(public code: ReaderErrorCode, message?: string) {
    super(message ?? code);
  }
}

/** First bytes handed over with "open", so pdf.js can start without a round trip. */
const HEAD_BYTES = 65536;

type Waiter = { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (p: ReaderProgress) => void };

let deliver: ((json: string) => void) | null = null;
let ready = false;
const readyWaiters: (() => void)[] = [];
let waiter: Waiter | null = null;
let source: PdfSource | null = null;

/** Called by the host once its web view exists. */
export function attachReaderHost(send: (json: string) => void) {
  deliver = send;
}

/** Called by the host when it unmounts: anything in flight fails. */
export function detachReaderHost() {
  deliver = null;
  ready = false;
  failWaiter(new ReaderError('failed', 'The reader closed.'));
}

function failWaiter(err: Error) {
  const w = waiter;
  waiter = null;
  w?.reject(err);
}

function post(msg: object) {
  deliver?.(JSON.stringify(msg));
}

/** Every message from the reader comes through here. */
export function receiveFromReader(raw: string) {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  switch (msg.type) {
    case 'ready':
      ready = true;
      readyWaiters.splice(0).forEach((fn) => fn());
      break;
    case 'range': {
      const src = source;
      if (!src) return;
      const end = Math.min(src.size, msg.end);
      src
        .read(msg.begin, end)
        .then((data) => post({ type: 'rangeData', begin: msg.begin, data }))
        .catch(() => failWaiter(new ReaderError('failed', 'Could not read that file.')));
      break;
    }
    case 'opened':
      waiter?.resolve({ pages: msg.pages, outline: msg.outline ?? [], scanned: !!msg.scanned });
      waiter = null;
      break;
    case 'progress':
      waiter?.onProgress?.({ stage: msg.stage, done: msg.done, total: msg.total });
      break;
    case 'extracted':
      waiter?.resolve({ pages: msg.pages, scans: msg.scans, scansSkipped: msg.scansSkipped ?? 0, figures: msg.figures });
      waiter = null;
      break;
    case 'error':
      failWaiter(new ReaderError(msg.code ?? 'failed', msg.message));
      break;
  }
}

function waitReady(ms: number): Promise<void> {
  if (ready && deliver) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // Ask again every second, in case the reader said "ready" before we listened.
    const ping = setInterval(() => post({ type: 'ping' }), 1000);
    const t = setTimeout(() => {
      clearInterval(ping);
      reject(new ReaderError('offline', 'The reader did not start.'));
    }, ms);
    readyWaiters.push(() => {
      clearTimeout(t);
      clearInterval(ping);
      resolve();
    });
    post({ type: 'ping' });
  });
}

function request<T>(msg: object, ms: number, onProgress?: (p: ReaderProgress) => void): Promise<T> {
  failWaiter(new ReaderError('failed', 'Replaced by a newer request.'));
  return new Promise<T>((resolve, reject) => {
    // The timer restarts on every progress message: a slow phone reading a
    // long range is fine as long as it keeps moving.
    let t = setTimeout(() => failWaiter(new ReaderError('timeout')), ms);
    const done = (fn: () => void) => {
      clearTimeout(t);
      fn();
    };
    waiter = {
      resolve: (v) => done(() => resolve(v)),
      reject: (e) => done(() => reject(e)),
      onProgress: (p) => {
        clearTimeout(t);
        t = setTimeout(() => failWaiter(new ReaderError('timeout')), ms);
        onProgress?.(p);
      },
    };
    post(msg);
  });
}

export const pdfReader = {
  async open(src: PdfSource): Promise<ReaderInfo> {
    // The first open downloads the reader (~1.5 MB, then cached).
    await waitReady(30_000);
    source?.close?.();
    source = src;
    const head = await src.read(0, Math.min(src.size, HEAD_BYTES));
    return request<ReaderInfo>({ type: 'open', length: src.size, head }, 60_000);
  },

  extract(
    from: number,
    to: number,
    opts: { maxScans: number; maxFigures: number },
    onProgress?: (p: ReaderProgress) => void
  ): Promise<ReaderOutput> {
    return request<ReaderOutput>({ type: 'extract', from, to, ...opts }, 45_000, onProgress);
  },

  close() {
    failWaiter(new ReaderError('failed', 'Closed.'));
    post({ type: 'close' });
    source?.close?.();
    source = null;
  },
};

/** A web File/Blob as a source (the web preview's picker gives one). */
export function blobSource(blob: Blob): PdfSource {
  return {
    size: blob.size,
    read: async (begin, end) => encode(await blob.slice(begin, end).arrayBuffer()),
  };
}

/** Plain-language message for a reader failure. */
export function readerErrorText(err: unknown): string {
  const code = err instanceof ReaderError ? err.code : 'failed';
  switch (code) {
    case 'password':
      return 'This PDF is locked with a password. Save an unlocked copy and try again.';
    case 'broken':
      return 'This PDF looks damaged. Try another copy of it.';
    case 'offline':
      return "Couldn't start the PDF reader. Check your internet and try again.";
    case 'timeout':
      return 'Reading this PDF is taking too long. Try fewer pages.';
    default:
      return "Couldn't read this PDF. Try again, or try another copy.";
  }
}
