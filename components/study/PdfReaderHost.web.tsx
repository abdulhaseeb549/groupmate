import { useEffect, useRef } from 'react';
import { ENGINE_HTML } from '../../utils/pdfReader/engine';
import { attachReaderHost, detachReaderHost, receiveFromReader } from '../../utils/pdfReader/reader';

/**
 * Web build of PdfReaderHost: the same reader page, in a hidden iframe.
 * Same messages as the phone's web view, so the web preview tests the real
 * reader.
 */
export function PdfReaderHost() {
  const ref = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && typeof e.data === 'string') receiveFromReader(e.data);
    };
    window.addEventListener('message', onMessage);
    attachReaderHost((json) => ref.current?.contentWindow?.postMessage(json, '*'));
    return () => {
      window.removeEventListener('message', onMessage);
      detachReaderHost();
    };
  }, []);

  return (
    <iframe
      ref={ref}
      srcDoc={ENGINE_HTML}
      title="PDF reader"
      aria-hidden
      tabIndex={-1}
      style={{ position: 'absolute', left: -10, top: -10, width: 1, height: 1, border: 0, opacity: 0, pointerEvents: 'none' }}
    />
  );
}
