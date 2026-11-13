import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, GlassButton } from '../Glass';
import { GradientButton } from '../GradientButton';
import { Icon } from '../Icon';
import { DeadlineEditSheet } from './DeadlineEditSheet';
import {
  blankDraft,
  courseColor,
  daysUntil,
  DeadlineSource,
  DraftDeadline,
  explainDue,
  formatDue,
  KIND_LABEL,
  useDeadlines,
} from '../../state/deadlines';
import { colors, type } from '../../theme';

type Props = {
  visible: boolean;
  drafts: DraftDeadline[];
  onChange: (drafts: DraftDeadline[]) => void;
  source: DeadlineSource;
  sourceText: string | null;
  onBack: () => void;
  onSaved: () => void;
};

type Tone = 'soon' | 'late' | 'plain' | 'missing';

function toneOf(d: DraftDeadline, today: Date): Tone {
  if (!d.dueOn) return 'missing';
  const n = daysUntil(d.dueOn, today);
  if (n < 0) return 'late';
  if (n <= 1) return 'soon';
  return 'plain';
}

const CHIP_TONE: Record<Tone, { bg: string; fg: string; strong: boolean }> = {
  soon: { bg: colors.yellowSoft, fg: colors.yellowText, strong: true },
  late: { bg: colors.redSoft, fg: colors.redText, strong: true },
  plain: { bg: 'rgba(21,21,26,0.05)', fg: colors.ink, strong: false },
  missing: { bg: colors.purpleSoft, fg: colors.purple, strong: true },
};

/**
 * Board PReviewDeadlines: what the AI found, each item editable, nothing
 * saved until "Save". The original message sits on top with the words each
 * date came from marked, so a wrong date is easy to catch.
 */
export function DeadlineReview({ visible, drafts, onChange, source, sourceText, onBack, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const { save } = useDeadlines();
  const today = useMemo(() => new Date(), [visible]);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const found = drafts.filter((d) => d.quote !== null || d.title).length;
  const missingDay = drafts.some((d) => !d.dueOn);
  const missingTitle = drafts.some((d) => !d.title.trim());
  const count = drafts.length;

  function update(key: string, patch: Partial<DraftDeadline>) {
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    if (count === 0 || missingDay || missingTitle) return;
    setSaving(true);
    setError(null);
    const { error: err } = await save(drafts, source, sourceText);
    setSaving(false);
    if (err) setError(err);
    else onSaved();
  }

  const heading =
    found === 0 && count <= 1 && !drafts[0]?.title
      ? 'No dates found'
      : `Found ${count} deadline${count === 1 ? '' : 's'}`;
  const sub = heading === 'No dates found' ? 'Add it yourself below.' : 'Nothing saves until you do.';

  const saveLabel = missingTitle
    ? 'Give each one a name'
    : missingDay
      ? 'Pick a day for each'
      : `Save ${count} deadline${count === 1 ? '' : 's'}`;

  const editingDraft = drafts.find((d) => d.key === editing) ?? null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack} statusBarTranslucent>
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
        >
          <GlassButton onPress={onBack} label="Back">
            <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2} />
          </GlassButton>

          <View style={styles.intro}>
            <Text style={styles.h1} accessibilityRole="header">
              {heading}
            </Text>
            <Text style={styles.sub}>{sub}</Text>
          </View>

          {sourceText ? (
            <View style={styles.figure}>
              <Text style={styles.eyebrow}>{source === 'shared' ? 'Shared message' : 'Your message'}</Text>
              <View style={styles.quote}>
                <Text style={styles.quoteText}>
                  <Marked text={sourceText} drafts={drafts} today={today} />
                </Text>
              </View>
            </View>
          ) : null}

          {drafts.map((d) => {
            const tone = CHIP_TONE[toneOf(d, today)];
            return (
              <View key={d.key} style={styles.card}>
                <View style={styles.titleRow}>
                  <TextInput
                    value={d.title}
                    onChangeText={(t) => update(d.key, { title: t })}
                    placeholder="What is it?"
                    placeholderTextColor={colors.faint}
                    style={styles.titleInput}
                    accessibilityLabel="Title"
                    maxLength={200}
                  />
                  <Pressable
                    onPress={() => onChange(drafts.filter((x) => x.key !== d.key))}
                    accessibilityRole="button"
                    accessibilityLabel="Remove this deadline"
                    style={styles.x}
                    hitSlop={6}
                  >
                    <Icon name="close" size={14} color={colors.muted} strokeWidth={2.4} />
                  </Pressable>
                </View>
                <View style={styles.chips}>
                  <Pressable
                    onPress={() => setEditing(d.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Due ${formatDue(d.dueOn, d.dueTime, today)}. Change`}
                    style={[styles.chip, { backgroundColor: tone.bg }]}
                  >
                    <Icon name="calendar" size={15} color={tone.fg} strokeWidth={2} />
                    <Text style={[styles.chipText, { color: tone.fg }, tone.strong && styles.chipStrong]}>
                      {formatDue(d.dueOn, d.dueTime, today)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setEditing(d.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.course ?? 'No subject'}, ${KIND_LABEL[d.kind]}. Change`}
                    style={styles.chip}
                  >
                    <View style={[styles.dot, { backgroundColor: courseColor(d.course) }]} />
                    <Text style={styles.chipText}>
                      {d.course ? `${d.course} · ${KIND_LABEL[d.kind]}` : KIND_LABEL[d.kind]}
                    </Text>
                  </Pressable>
                </View>
                {d.quote && d.dueOn && needsExplaining(d.quote, d.dueOn) ? (
                  <View style={styles.why}>
                    <Icon name="sparkle" size={14} color={colors.purple} strokeWidth={1.9} />
                    <Text style={styles.whyText} numberOfLines={2}>
                      “{d.quote}” = {explainDue(d.dueOn, d.dueTime, today)}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}

          <Pressable
            onPress={() => {
              const d = blankDraft();
              onChange([...drafts, d]);
              setEditing(d.key);
            }}
            accessibilityRole="button"
            style={styles.link}
          >
            <Icon name="plus" size={16} color={colors.purple} strokeWidth={2.2} />
            <Text style={styles.linkText}>{count === 0 ? 'Add a deadline' : 'Add one it missed'}</Text>
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <Glass radius={26} style={[styles.bar, { paddingBottom: 14 + Math.max(insets.bottom, 14) }]}>
          <GradientButton
            label={saving ? 'Saving…' : saveLabel}
            onPress={handleSave}
            loading={saving}
            disabled={saving || count === 0 || missingDay || missingTitle}
          />
        </Glass>

        <DeadlineEditSheet
          draft={editingDraft}
          today={today}
          onChange={(patch) => editingDraft && update(editingDraft.key, patch)}
          onClose={() => setEditing(null)}
        />
      </SafeAreaView>
    </Modal>
  );
}

const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * "kal 5 baje" needs the plain-words line; "Monday 10am" already says its
 * day, and the chip shows the date (board PReviewDeadlines).
 */
function needsExplaining(quote: string, dueOn: string): boolean {
  const [y, m, d] = dueOn.split('-').map(Number);
  const day = WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
  return !quote.toLowerCase().includes(day);
}

/** The message with each quoted date phrase marked in its chip's colour. */
function Marked({ text, drafts, today }: { text: string; drafts: DraftDeadline[]; today: Date }) {
  const marks = drafts
    .filter((d) => d.quote)
    .map((d) => {
      const at = text.toLowerCase().indexOf(d.quote!.toLowerCase());
      return { at, len: d.quote!.length, tone: toneOf(d, today) };
    })
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);

  const parts: { s: string; tone?: Tone }[] = [];
  let i = 0;
  for (const m of marks) {
    if (m.at < i) continue; // overlapping quote: keep the first
    if (m.at > i) parts.push({ s: text.slice(i, m.at) });
    parts.push({ s: text.slice(m.at, m.at + m.len), tone: m.tone });
    i = m.at + m.len;
  }
  if (i < text.length) parts.push({ s: text.slice(i) });

  return (
    <>
      {parts.map((p, k) =>
        p.tone ? (
          <Text
            key={k}
            style={[
              styles.mark,
              p.tone === 'soon' && { backgroundColor: colors.yellowSoft, color: colors.yellowText },
              p.tone === 'late' && { backgroundColor: colors.redSoft, color: colors.redText },
            ]}
          >
            {p.s}
          </Text>
        ) : (
          <Text key={k}>{p.s}</Text>
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 20,
  },
  intro: {
    gap: 6,
  },
  h1: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  sub: {
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: colors.muted,
  },
  figure: {
    gap: 8,
  },
  eyebrow: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  quote: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.08)',
  },
  quoteText: {
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: '#4A475A',
  },
  mark: {
    backgroundColor: 'rgba(21,21,26,0.05)',
    color: colors.ink,
    borderRadius: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    padding: 16,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
  x: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(21,21,26,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  chipStrong: {
    fontFamily: type.button.fontFamily,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  why: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  whyText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  link: {
    alignSelf: 'flex-start',
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    color: colors.purple,
  },
  error: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.redText,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
});
