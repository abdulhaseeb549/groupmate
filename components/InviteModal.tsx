import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from './ConfirmDialog';
import { FadeIn } from './FadeIn';
import { GradientButton, WhiteButton } from './GradientButton';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Deep link that opens the app straight into joining this project (see app.json's scheme). */
export function inviteLink(code: string): string {
  return `groupmate://join/${code}`;
}

/**
 * GInvite board: a bottom sheet with the project's invite code, a share
 * action and a way to make a fresh code. No clipboard library is in this
 * app yet, so "share" goes through the OS share sheet (Share.share) rather
 * than a dedicated copy button — every share sheet on both platforms
 * includes a copy option of its own.
 */
export function InviteModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { project, regenerateInviteCode } = useProject();
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    try {
      // A tappable link, not just the code: on a phone that has GroupMate the
      // groupmate:// scheme opens it straight into joining, and on one that
      // doesn't the message still carries the code to type in by hand. Sent
      // through the OS share sheet so it lands in WhatsApp, SMS, anywhere.
      await Share.share({
        message:
          `Join my "${project.name}" group on GroupMate:\n${inviteLink(project.inviteCode)}\n\n` +
          `No app yet? Install it, then enter code ${project.inviteCode} when you sign up.`,
      });
    } catch {
      // User dismissed the share sheet — nothing to handle.
    }
  }

  async function confirmRegenerate() {
    setConfirmingRegenerate(false);
    setRegenerating(true);
    setError(null);
    const result = await regenerateInviteCode();
    setRegenerating(false);
    if (result.error) setError(result.error);
  }

  return (
    <>
      <Sheet visible={visible} onClose={onClose}>
        <View
          accessibilityLabel="Invite teammates"
          style={[styles.body, { paddingBottom: Math.max(insets.bottom, 0) + 32 }]}
        >
          <FadeIn>
            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header">
                Invite teammates
              </Text>
              <Text style={styles.sub}>This code joins {project.name}.</Text>
            </View>
          </FadeIn>

          <FadeIn delay={60}>
            <View style={styles.codeBox}>
              <Text style={styles.code} selectable>
                {project.inviteCode}
              </Text>
              <Text style={styles.m}>Works at sign-up too</Text>
            </View>
          </FadeIn>

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="exclamation" size={18} color={colors.redText} strokeWidth={2.2} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <FadeIn delay={120}>
            <View style={styles.actions}>
              <GradientButton
                label="Share invite"
                onPress={share}
                leading={<Icon name="share" size={18} color={colors.onInk} strokeWidth={2} />}
              />
              <WhiteButton label="Done" onPress={onClose} />
              <Pressable
                onPress={() => setConfirmingRegenerate(true)}
                disabled={regenerating}
                accessibilityRole="button"
                style={({ pressed }) => [styles.newCode, pressed && styles.pressed]}
              >
                <Text style={styles.newCodeText}>{regenerating ? 'Making a new code…' : 'New code'}</Text>
              </Pressable>
            </View>
          </FadeIn>
        </View>
      </Sheet>

      <ConfirmDialog
        visible={confirmingRegenerate}
        title="Generate a new code?"
        message="The current code will stop working right away — anyone who hasn't joined yet will need the new one."
        confirmLabel="Generate"
        destructive
        onConfirm={confirmRegenerate}
        onCancel={() => setConfirmingRegenerate(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Board: 20 in from the sides, 20 under the grab bar (Sheet's grab zone is 21; the board's is 13), 22 between blocks.
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 22,
  },
  head: {
    gap: 6,
  },
  title: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  sub: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  codeBox: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    boxShadow: 'inset 0 0 0 1px #E6DFFC',
  },
  code: {
    fontFamily: type.hero.fontFamily,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: 5,
    color: colors.ink,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.redSoft,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.redText,
  },
  actions: {
    gap: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  // Board: a quiet 44-high text button, 14/500 muted, underlined in #DCD8E3.
  newCode: {
    height: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  newCodeText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textDecorationLine: 'underline',
    textDecorationColor: '#DCD8E3',
  },
});
