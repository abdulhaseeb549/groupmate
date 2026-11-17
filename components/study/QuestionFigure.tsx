import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../Icon';
import { QuestionImage } from '../../state/studyQuiz';
import { colors, type } from '../../theme';

const MAX_HEIGHT = 230;

/** The picture's width/height: from the quiz when known, otherwise measured once it loads. */
function useRatio(image: QuestionImage): number {
  const known = image.width && image.height ? image.width / image.height : null;
  const [ratio, setRatio] = useState(known ?? 4 / 3);
  useEffect(() => {
    if (known) {
      setRatio(known);
      return;
    }
    Image.getSize(
      image.uri,
      (w, h) => h > 0 && setRatio(w / h),
      () => undefined
    );
  }, [image.uri, known]);
  return ratio;
}

/** A picture question's figure, above the question. Tap to see it full screen. */
export function QuestionFigure({ image }: { image: QuestionImage }) {
  const ratio = useRatio(image);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="Figure for this question. Tap to make it bigger."
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <Image source={{ uri: image.uri }} style={[styles.image, { aspectRatio: ratio }]} resizeMode="contain" />
        <View style={styles.zoom} pointerEvents="none">
          <Icon name="search" size={14} color={colors.ink} strokeWidth={2} />
        </View>
      </Pressable>
      <FigureZoom image={image} ratio={ratio} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Full screen. Tap the picture to zoom in and drag around; tap again to fit. */
function FigureZoom({ image, ratio, visible, onClose }: { image: QuestionImage; ratio: number; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (!visible) setZoomed(false);
  }, [visible]);

  const fitW = Math.min(width, (height - 160) * ratio);
  const w = zoomed ? fitW * 2.5 : fitW;
  const h = w / ratio;

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="fade" statusBarTranslucent>
      <View style={styles.zoomScreen}>
        <ScrollView
          horizontal
          contentContainerStyle={{ minWidth: width, alignItems: 'center', justifyContent: 'center' }}
          showsHorizontalScrollIndicator={false}
        >
          <ScrollView
            contentContainerStyle={{ minHeight: height, alignItems: 'center', justifyContent: 'center' }}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              onPress={() => setZoomed((z) => !z)}
              accessibilityRole="imagebutton"
              accessibilityLabel={zoomed ? 'Figure, zoomed in. Tap to fit the screen.' : 'Figure. Tap to zoom in.'}
            >
              <Image source={{ uri: image.uri }} style={{ width: w, height: h }} resizeMode="contain" />
            </Pressable>
          </ScrollView>
        </ScrollView>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close figure"
          hitSlop={8}
          style={[styles.close, { top: Math.max(insets.top, 24) + 8 }]}
        >
          <Icon name="close" size={20} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
        <Text style={[styles.hint, { bottom: Math.max(insets.bottom, 16) + 16 }]}>
          {zoomed ? 'Drag to look around · tap to fit' : 'Tap the picture to zoom in'}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.08)',
    padding: 10,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.85,
  },
  image: {
    width: '100%',
    maxHeight: MAX_HEIGHT,
  },
  zoom: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomScreen: {
    flex: 1,
    backgroundColor: '#111114',
  },
  close: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.7)',
  },
});
