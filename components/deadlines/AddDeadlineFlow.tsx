import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../GradientButton';
import { Icon, IconName } from '../Icon';
import { Sheet } from '../Sheet';
import { DeadlineReview } from './DeadlineReview';
import { blankDraft, DeadlineSource, DraftDeadline, parseDeadlines } from '../../state/deadlines';
import { useNavigation } from '../../state/NavigationProvider';
import { getDeadlinePhoto } from '../../utils/deadlinePhoto';
import { colors, type } from '../../theme';

type Step = 'menu' | 'paste' | 'type' | 'reading' | 'review' | 'closed';

/**
 * "+" → Add a deadline (board PAddDeadline) → paste / photo / screenshot /
 * type → AI reads it → review (board PReviewDeadlines) → save.
 *
 * Mounted once at the app shell and opened through NavigationProvider, so
 * the "+" menu on any tab, and later the Android share sheet, can start it.
 */
export function AddDeadlineFlow() {
  const { addDeadlineOpen, closeAddDeadline } = useNavigation();
  const [step, setStep] = useState<Step>('closed');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftDeadline[]>([]);
  const [source, setSource] = useState<DeadlineSource>('pasted');
  const [sourceText, setSourceText] = useState<string | null>(null);

  useEffect(() => {
    if (addDeadlineOpen) {
      setStep('menu');
      setText('');
      setError(null);
      setDrafts([]);
      setSourceText(null);
    }
  }, [addDeadlineOpen]);

  function close() {
    setStep('closed');
    closeAddDeadline();
  }

  async function openPaste() {
    setError(null);
    setSource('pasted');
    // A student who copied the message in WhatsApp should not have to paste it.
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip && clip.trim().length >= 8 && clip.length <= 4000) setText(clip.trim());
    } catch {
      // Clipboard access is a nicety; the box still works.
    }
    setStep('paste');
  }

  function openType() {
    setError(null);
    setSource('typed');
    setText('');
    setStep('type');
  }

  async function read(input: { text?: string; image?: { base64: string; mimeType?: string } }, back: Step) {
    setError(null);
    setStep('reading');
    const { deadlines, error: err } = await parseDeadlines(input);
    if (err || !deadlines) {
      setError(err ?? 'Could not read that. Try again.');
      setStep(back);
      return;
    }
    setSourceText(input.text ?? null);
    setDrafts(deadlines.length > 0 ? deadlines : [blankDraft()]);
    setStep('review');
  }

  async function fromPhoto(from: 'camera' | 'gallery') {
    setError(null);
    setSource('photo');
    const { photo, error: err } = await getDeadlinePhoto(from);
    if (err) {
      setError(err);
      return;
    }
    if (!photo) return; // cancelled
    await read({ image: photo }, 'menu');
  }

  const sheetOpen = step === 'menu' || step === 'paste' || step === 'type' || step === 'reading';

  return (
    <>
      <Sheet visible={addDeadlineOpen && sheetOpen} onClose={close}>
        {step === 'menu' ? (
          <MenuBody onClose={close} onPaste={openPaste} onType={openType} onPhoto={fromPhoto} error={error} />
        ) : step === 'reading' ? (
          <Reading />
        ) : (
          <TextBody
            typed={step === 'type'}
            text={text}
            onChange={setText}
            error={error}
            onBack={() => {
              setError(null);
              setStep('menu');
            }}
            onSubmit={() => read({ text: text.trim() }, step)}
          />
        )}
      </Sheet>

      <DeadlineReview
        visible={addDeadlineOpen && step === 'review'}
        drafts={drafts}
        onChange={setDrafts}
        source={source}
        sourceText={sourceText}
        onBack={() => setStep(source === 'photo' ? 'menu' : source === 'typed' ? 'type' : 'paste')}
        onSaved={close}
      />
    </>
  );
}

type Option = { icon: IconName; bg: string; stroke: string; title: string; sub: string; onPress: () => void };

function MenuBody({
  onClose,
  onPaste,
  onType,
  onPhoto,
  error,
}: {
  onClose: () => void;
  onPaste: () => void;
  onType: () => void;
  onPhoto: (from: 'camera' | 'gallery') => void;
  error: string | null;
}) {
  const insets = useSafeAreaInsets();
  const options: Option[] = [
    { icon: 'clipboard', bg: colors.purpleSoft, stroke: colors.purple, title: 'Paste a message', sub: 'WhatsApp, email, Classroom', onPress: onPaste },
    { icon: 'camera', bg: colors.yellowSoft, stroke: colors.yellowText, title: 'Take a photo', sub: 'Notice board or whiteboard', onPress: () => onPhoto('camera') },
    { icon: 'image', bg: colors.mint, stroke: colors.mintText, title: 'Choose a screenshot', sub: 'From your gallery', onPress: () => onPhoto('gallery') },
    { icon: 'edit', bg: 'rgba(21,21,26,0.05)', stroke: colors.muted, title: 'Type it', sub: 'Name, subject, date', onPress: onType },
  ];
  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, 0) + 34 }}>
      <Header title="Add a deadline" sub="We pick out the dates." onClose={onClose} />
      <View style={styles.options}>
        {options.map((o, i) => (
          <View key={o.title}>
            {i > 0 ? <View style={styles.hair} /> : null}
            <Pressable
              onPress={o.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${o.sub}`}
              style={({ pressed }) => [styles.opt, pressed && styles.optPressed]}
            >
              <View style={[styles.tile, { backgroundColor: o.bg }]}>
                <Icon name={o.icon} size={20} color={o.stroke} strokeWidth={1.8} />
              </View>
              <View style={styles.optText}>
                <Text style={styles.optTitle}>{o.title}</Text>
                <Text style={styles.m}>{o.sub}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.faint} strokeWidth={2} />
            </Pressable>
          </View>
        ))}
      </View>
      {error ? <Text style={[styles.m, styles.error]}>{error}</Text> : null}
      <View style={styles.tip}>
        <Icon name="share" size={18} color={colors.purple} strokeWidth={1.9} />
        <Text style={styles.tipText}>
          In WhatsApp: hold the message, <Text style={styles.b}>Share</Text>, then <Text style={styles.b}>GroupMate</Text>.
        </Text>
      </View>
    </View>
  );
}

function TextBody({
  typed,
  text,
  onChange,
  error,
  onBack,
  onSubmit,
}: {
  typed: boolean;
  text: string;
  onChange: (t: string) => void;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const ready = text.trim().length >= 3;
  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, 0) + 24 }}>
      <Header
        title={typed ? 'Type it' : 'Paste a message'}
        sub={typed ? 'Say it how you would to a friend.' : 'We pick out the dates.'}
        onBack={onBack}
      />
      <View style={styles.body}>
        <TextInput
          value={text}
          onChangeText={onChange}
          multiline
          autoFocus={typed || text.length === 0}
          placeholder={typed ? 'DBMS assignment 3, Friday 5 pm' : 'Paste the message here'}
          placeholderTextColor={colors.faint}
          style={styles.input}
          textAlignVertical="top"
          maxLength={4000}
          accessibilityLabel={typed ? 'Deadline' : 'Message'}
        />
        {error ? <Text style={[styles.m, styles.errorInline]}>{error}</Text> : null}
        <GradientButton label="Find the dates" onPress={onSubmit} disabled={!ready} />
      </View>
    </View>
  );
}

function Reading() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.reading, { paddingBottom: Math.max(insets.bottom, 0) + 48 }]}>
      <ActivityIndicator color={colors.purple} />
      <Text style={styles.optTitle}>Reading it</Text>
      <Text style={styles.m}>Picking out the dates.</Text>
    </View>
  );
}

function Header({ title, sub, onClose, onBack }: { title: string; sub: string; onClose?: () => void; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.circle} hitSlop={4}>
          <Icon name="chevronLeft" size={18} color={colors.ink} strokeWidth={2} />
        </Pressable>
      ) : null}
      <View style={styles.headText}>
        <Text style={styles.h2} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.m}>{sub}</Text>
      </View>
      {onClose ? (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.circle} hitSlop={4}>
          <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
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
  b: {
    fontFamily: type.button.fontFamily,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: {
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 16,
  },
  optPressed: {
    backgroundColor: 'rgba(21,21,26,0.04)',
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optText: {
    flex: 1,
    gap: 1,
  },
  optTitle: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 16,
    lineHeight: 21,
    color: colors.ink,
  },
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 68,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  tipText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  error: {
    color: colors.redText,
    marginTop: 8,
    marginHorizontal: 20,
  },
  errorInline: {
    color: colors.redText,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  input: {
    minHeight: 140,
    maxHeight: 260,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.04)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  reading: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 36,
  },
});
