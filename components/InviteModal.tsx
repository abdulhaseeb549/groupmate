import { useState } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, radius, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Deep link that opens the app straight into joining this project (see app.json's scheme). */
export function inviteLink(code: string): string {
  return `groupmate://join/${code}`;
}

/**
 * Shows the project's invite code and lets its owner share it or generate a
 * fresh one. No clipboard library is in this app yet, so "share" goes
 * through the OS share sheet (Share.share) rather than a dedicated copy
 * button — every share sheet on both platforms includes a copy option of
 * its own.
 */
export function InviteModal({ visible, onClose }: Props) {
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
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={[type.projectTitle, styles.ink]}>Invite teammates</Text>
            <Text style={[type.body, styles.muted]}>
              Anyone with this code can join {project.name} — at sign-up, or from "Join a project" if they already
              have an account. Once they're in, they'll show up in your chats.
            </Text>

            <View style={styles.codeBox}>
              <Text style={[type.pageTitle, styles.code]} selectable>
                {project.inviteCode}
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
                <Text style={[type.caption, styles.errorText]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={share}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.shareButton, pressed && styles.pressed]}
            >
              <Icon name="users" size={16} color={colors.onInk} strokeWidth={2} />
              <Text style={[type.button, styles.onInk]}>Share invite</Text>
            </Pressable>

            <Pressable
              onPress={() => setConfirmingRegenerate(true)}
              disabled={regenerating}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.regenerateLink}
            >
              <Text style={[type.caption, styles.link]}>
                {regenerating ? 'Generating a new code…' : 'Generate a new code'}
              </Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={[type.button, styles.ink]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,15,26,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPadding,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    gap: 10,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  onInk: {
    color: colors.onInk,
  },
  codeBox: {
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  code: {
    color: colors.purple,
    letterSpacing: 3,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  button: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.75,
  },
  shareButton: {
    backgroundColor: colors.purple,
    marginTop: 4,
  },
  regenerateLink: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  link: {
    color: colors.purple,
  },
  closeButton: {
    backgroundColor: colors.surfaceMuted,
  },
});
