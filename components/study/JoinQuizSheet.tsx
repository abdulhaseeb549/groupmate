import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../GradientButton';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { joinQuiz } from '../../state/studyQuiz';
import { colors, type } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called with the joined quiz's id; the parent opens it. */
  onJoined: (quizId: string) => void;
};

/** A friend sent a 6-letter code: type it, join their quiz, take it. */
export function JoinQuizSheet({ visible, onClose, onJoined }: Props) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setCode('');
      setError(null);
    }
  }, [visible]);

  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  async function join() {
    if (clean.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { quizId, error: err } = await joinQuiz(clean);
    setBusy(false);
    if (!quizId) {
      setError(err);
      return;
    }
    onJoined(quizId);
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ paddingBottom: Math.max(insets.bottom, 0) + 24 }}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.h2} accessibilityRole="header">
              Join a quiz
            </Text>
            <Text style={styles.m}>Type the code your friend sent.</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.circle} hitSlop={4}>
            <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>
        <View style={styles.body}>
          <TextInput
            value={clean}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={6}
            placeholder="ABC123"
            placeholderTextColor={colors.faint}
            style={styles.input}
            accessibilityLabel="Quiz code"
            onSubmitEditing={join}
          />
          {error ? <Text style={[styles.m, styles.error]}>{error}</Text> : null}
          <GradientButton label={busy ? 'Joining…' : 'Join'} onPress={join} loading={busy} disabled={clean.length !== 6 || busy} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headText: {
    flex: 1,
    gap: 4,
  },
  h2: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  input: {
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(21,21,26,0.04)',
    textAlign: 'center',
    fontFamily: 'CabinetGrotesk-Extrabold',
    fontSize: 30,
    letterSpacing: 6,
    color: colors.ink,
  },
  error: {
    color: colors.redText,
  },
});
