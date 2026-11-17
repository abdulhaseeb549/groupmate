import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ENGINE_HTML } from '../../utils/pdfReader/engine';
import { attachReaderHost, detachReaderHost, receiveFromReader } from '../../utils/pdfReader/reader';

/**
 * The hidden web view the PDF reader runs in (see utils/pdfReader). Mounted
 * while the quiz setup screen is open; it draws nothing the student sees.
 * Kept at 1x1 inside a clipped box rather than opacity 0, which crashes
 * some Android web views.
 */
export function PdfReaderHost() {
  const ref = useRef<WebView>(null);

  useEffect(() => {
    attachReaderHost((json) => {
      ref.current?.injectJavaScript(`window.__gm && window.__gm(${JSON.stringify(json)});true;`);
    });
    return () => detachReaderHost();
  }, []);

  return (
    <View style={styles.box} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <WebView
        ref={ref}
        source={{ html: ENGINE_HTML, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(e) => receiveFromReader(e.nativeEvent.data)}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: -10,
    top: -10,
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
  web: {
    width: 1,
    height: 1,
  },
});
