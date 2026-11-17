import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../Icon';
import { Chapter } from '../../utils/pdfReader/reader';
import { colors, type } from '../../theme';

export type PageRange = { from: number; to: number };

type Props = {
  pageCount: number;
  chapters: Chapter[];
  range: PageRange | null;
  onChange: (range: PageRange | null) => void;
  /** Most pages one quiz can cover (fewer for scanned books). */
  limit: number;
  scanned: boolean;
};

const CHAPTERS_SHOWN = 8;

/** Whether a range can be quizzed on: in the book, in order, and not too long. */
export function rangeProblem(range: PageRange | null, pageCount: number, limit: number): string | null {
  if (!range) return 'Pick the pages to cover.';
  if (range.from < 1 || range.to > pageCount || range.from > range.to) return `Pages go from 1 to ${pageCount}.`;
  const n = range.to - range.from + 1;
  if (n > limit) return `That's ${n} pages. Pick up to ${limit} for one quiz.`;
  return null;
}

/**
 * Which part of a big PDF the quiz covers: the book's own chapters when it
 * has them (tap one, or tap a second to take in everything between), and
 * From/To page boxes either way.
 */
export function PagePicker({ pageCount, chapters, range, onChange, limit, scanned }: Props) {
  const spans = useMemo(
    () =>
      chapters.map((c, i) => ({
        ...c,
        end: Math.max(c.page, (chapters[i + 1]?.page ?? pageCount + 1) - 1),
      })),
    [chapters, pageCount]
  );
  const [showAll, setShowAll] = useState(false);
  const [fromText, setFromText] = useState(range ? String(range.from) : '');
  const [toText, setToText] = useState(range ? String(range.to) : '');

  // Keep the boxes in step when a chapter tap changes the range.
  useEffect(() => {
    setFromText(range ? String(range.from) : '');
    setToText(range ? String(range.to) : '');
  }, [range?.from, range?.to]);

  // The chapters the current range covers exactly, if it lines up with them.
  const startIdx = range ? spans.findIndex((s) => s.page === range.from) : -1;
  const endIdx = range ? spans.findIndex((s) => s.end === range.to) : -1;
  const picked = startIdx >= 0 && endIdx >= startIdx ? [startIdx, endIdx] : null;

  function tapChapter(i: number) {
    let next: [number, number] | null;
    if (!picked) next = [i, i];
    else if (i < picked[0] || i > picked[1]) next = [Math.min(picked[0], i), Math.max(picked[1], i)];
    else if (picked[0] !== picked[1]) next = [i, i];
    else next = null;
    onChange(next ? { from: spans[next[0]].page, to: spans[next[1]].end } : null);
  }

  function typed(fromValue: string, toValue: string) {
    setFromText(fromValue);
    setToText(toValue);
    const from = Number(fromValue);
    const to = Number(toValue);
    if (fromValue && toValue && Number.isInteger(from) && Number.isInteger(to)) onChange({ from, to });
    else onChange(null);
  }

  const problem = range ? rangeProblem(range, pageCount, limit) : null;
  const count = range && !problem ? range.to - range.from + 1 : 0;
  const shown = showAll ? spans : spans.slice(0, CHAPTERS_SHOWN);

  return (
    <View style={styles.group}>
      <Text style={styles.eyebrow}>Pages</Text>

      <View style={styles.fields}>
        <PageField label="From" value={fromText} onChange={(v) => typed(v, toText)} bad={!!problem} />
        <Text style={styles.dash}>–</Text>
        <PageField label="To" value={toText} onChange={(v) => typed(fromText, v)} bad={!!problem} />
      </View>
      <Text style={[styles.m, problem ? styles.bad : null]} accessibilityLiveRegion="polite">
        {problem ??
          (count > 0
            ? `${count} ${count === 1 ? 'page' : 'pages'} of ${pageCount}`
            : `Up to ${limit} pages${scanned ? ' (scanned book)' : ''} of ${pageCount}`)}
      </Text>

      {spans.length >= 2 ? (
        <View style={[styles.card, styles.list]}>
          {shown.map((s, i) => {
            const on = !!picked && i >= picked[0] && i <= picked[1];
            return (
              <View key={`${s.page}-${i}`}>
                {i > 0 ? <View style={styles.sep} /> : null}
                <Pressable
                  onPress={() => tapChapter(i)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${s.title}, pages ${s.page} to ${s.end}`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={[styles.tick, on ? styles.tickOn : null]}>
                    {on ? <Icon name="check" size={13} color="#FFFFFF" strokeWidth={2.6} /> : null}
                  </View>
                  <Text style={[styles.t, styles.flex]} numberOfLines={2}>
                    {s.title}
                  </Text>
                  <Text style={styles.m}>
                    {s.page === s.end ? `p. ${s.page}` : `p. ${s.page}–${s.end}`}
                  </Text>
                </Pressable>
              </View>
            );
          })}
          {spans.length > CHAPTERS_SHOWN ? (
            <>
              <View style={styles.sep} />
              <Pressable
                onPress={() => setShowAll((v) => !v)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.more, pressed && styles.pressed]}
              >
                <Text style={styles.moreText}>{showAll ? 'Show fewer' : `Show all ${spans.length} chapters`}</Text>
                <Icon name={showAll ? 'chevronUp' : 'chevronDown'} size={16} color={colors.purple} strokeWidth={2} />
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PageField({ label, value, onChange, bad }: { label: string; value: string; onChange: (v: string) => void; bad: boolean }) {
  return (
    <View style={[styles.field, bad && styles.fieldBad]}>
      <Text style={styles.m}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="–"
        placeholderTextColor={colors.faint}
        accessibilityLabel={`${label} page`}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  fields: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dash: {
    fontFamily: type.caption.fontFamily,
    fontSize: 16,
    color: colors.faint,
  },
  field: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  fieldBad: {
    borderColor: colors.red,
  },
  input: {
    flex: 1,
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    padding: 0,
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
  },
  list: {
    paddingVertical: 4,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pressed: {
    backgroundColor: 'rgba(21,21,26,0.03)',
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ECEAF0',
    marginLeft: 50,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  bad: {
    color: colors.redText,
  },
  flex: {
    flex: 1,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  moreText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.purple,
  },
});
