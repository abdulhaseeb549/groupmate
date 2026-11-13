import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../GradientButton';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { fetchLeaderboard, formatDuration, LeaderRow, shareQuiz } from '../../state/studyQuiz';
import { colors, type } from '../../theme';

type Props = {
  /** Null = closed. */
  quiz: { id: string; title: string; joined: boolean } | null;
  onClose: () => void;
};

/**
 * Friends leaderboard for one quiz. Everyone on the quiz (the owner and
 * whoever joined with the code) is ranked by their FIRST attempt: score,
 * then time. Retakes are practice and never move you up.
 */
export function LeaderboardSheet({ quiz, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quiz) return;
    let cancelled = false;
    setRows(null);
    setCode(null);
    setError(null);
    fetchLeaderboard(quiz.id)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setError('Could not load the board. Try again.'));
    if (!quiz.joined) {
      shareQuiz(quiz.id).then((r) => !cancelled && setCode(r.code));
    }
    return () => {
      cancelled = true;
    };
  }, [quiz?.id]);

  async function share() {
    if (!quiz || !code) return;
    await Share.share({
      message: `Can you beat me on "${quiz.title}"? Open GroupMate → Study → Join a quiz, and type ${code}.`,
    });
  }

  return (
    <Sheet visible={quiz !== null} onClose={onClose}>
      {quiz ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 0) + 24 }}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.eyebrow}>Leaderboard</Text>
              <Text style={styles.h2} numberOfLines={2} accessibilityRole="header">
                {quiz.title}
              </Text>
              <Text style={styles.m}>First try counts. Score, then time.</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.circle} hitSlop={4}>
              <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
            </Pressable>
          </View>

          {!quiz.joined ? (
            <View style={styles.codeCard}>
              <View style={styles.codeText}>
                <Text style={styles.eyebrow}>Quiz code</Text>
                {code ? (
                  <Text style={styles.code} accessibilityLabel={`Code ${code.split('').join(' ')}`}>
                    {code}
                  </Text>
                ) : (
                  <ActivityIndicator color={colors.purple} style={styles.codeLoading} />
                )}
              </View>
              <GradientButton
                label="Challenge"
                onPress={share}
                disabled={!code}
                leading={<Icon name="share" size={16} color="#FFFFFF" strokeWidth={2} />}
                style={styles.challenge}
              />
            </View>
          ) : null}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {error ? (
              <Text style={[styles.m, styles.error]}>{error}</Text>
            ) : rows === null ? (
              <ActivityIndicator color={colors.purple} style={styles.loading} />
            ) : rows.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.t}>No scores yet</Text>
                <Text style={styles.m}>Finish the quiz, then send the code to your friends.</Text>
              </View>
            ) : (
              rows.map((r, i) => (
                <View key={r.userId}>
                  {i > 0 ? <View style={styles.hair} /> : null}
                  <View style={[styles.row, r.isMe && styles.rowMe]}>
                    <View style={[styles.rank, r.rank === 1 && styles.rankFirst]}>
                      {r.rank === 1 ? (
                        <Icon name="trophy" size={16} color={colors.yellowText} strokeWidth={1.9} />
                      ) : (
                        <Text style={styles.rankText}>{r.rank}</Text>
                      )}
                    </View>
                    <View style={[styles.face, { backgroundColor: r.avatarBg ?? colors.purpleSoft }]}>
                      <Text style={[styles.faceText, { color: r.avatarFg ?? colors.purple }]}>{r.initials}</Text>
                    </View>
                    <View style={styles.who}>
                      <Text style={styles.t} numberOfLines={1}>
                        {r.isMe ? 'You' : r.name}
                      </Text>
                      <Text style={styles.m}>
                        {formatDuration(r.durationMs)}
                        {r.attempts > 1 ? ` · ${r.attempts} tries` : ''}
                      </Text>
                    </View>
                    <Text style={styles.score}>
                      {r.score}
                      <Text style={styles.scoreOf}>/{r.total}</Text>
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
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
    paddingBottom: 14,
  },
  headText: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  h2: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink,
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
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 14,
    paddingLeft: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  codeText: {
    flex: 1,
    gap: 2,
  },
  code: {
    fontFamily: 'CabinetGrotesk-Extrabold',
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: 3,
    color: colors.ink,
  },
  codeLoading: {
    alignSelf: 'flex-start',
    marginVertical: 8,
  },
  challenge: {
    width: 140,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  loading: {
    marginVertical: 28,
  },
  error: {
    color: colors.redText,
    paddingVertical: 16,
  },
  empty: {
    paddingVertical: 20,
    gap: 4,
  },
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 84,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
  },
  rowMe: {
    backgroundColor: colors.purpleSoft,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankFirst: {
    backgroundColor: colors.yellowSoft,
  },
  rankText: {
    fontFamily: type.button.fontFamily,
    fontSize: 15,
    color: colors.muted,
  },
  face: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceText: {
    fontFamily: type.avatarInitials.fontFamily,
    fontSize: 13,
  },
  who: {
    flex: 1,
    gap: 1,
  },
  score: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
  },
  scoreOf: {
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    color: colors.muted,
  },
});
