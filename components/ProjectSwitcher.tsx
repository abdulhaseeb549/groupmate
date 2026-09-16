import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { useNavigation } from '../state/NavigationProvider';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Picks which project the app is showing, and offers a way to add another.
 *
 * Exists because creating a project used to *replace* the one you had —
 * project_members could always hold many rows per user, but the client
 * read one and the brief commit deleted the rest. Now that creating is
 * additive, something has to choose between them.
 */
export function ProjectSwitcher({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { project, projects, switchProject } = useProject();
  const { openNewProject } = useNavigation();

  function pick(projectId: string) {
    onClose();
    switchProject(projectId);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grabber} />
        <Text style={[type.projectTitle, styles.ink, styles.heading]}>Your projects</Text>

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {projects.map((item) => {
            const active = item.id === project.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => pick(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.name}${active ? ', current project' : ''}`}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.tile, active && styles.tileActive]}>
                  <Icon
                    name="folder"
                    size={18}
                    color={active ? colors.purple : colors.muted}
                    strokeWidth={1.8}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={[type.taskTitle, styles.ink]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[type.caption, styles.muted]} numberOfLines={1}>
                    {item.course} · {item.memberCount}{' '}
                    {item.memberCount === 1 ? 'member' : 'members'}
                    {item.role === 'owner' ? '' : ' · joined'}
                  </Text>
                </View>
                {active ? <Icon name="check" size={18} color={colors.purple} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => {
              onClose();
              openNewProject();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            {/* Dashed, like the invite row in the chat list: this adds
                something rather than switching to something. */}
            <View style={styles.addTile}>
              <Icon name="plus" size={18} color={colors.purple} strokeWidth={2.2} />
            </View>
            <View style={styles.rowText}>
              <Text style={[type.taskTitle, styles.action]} numberOfLines={1}>
                New project
              </Text>
              <Text style={[type.caption, styles.muted]} numberOfLines={1}>
                Read another brief — this one stays as it is
              </Text>
            </View>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 10,
    maxHeight: '70%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  heading: {
    marginBottom: 6,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 16,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileActive: {
    backgroundColor: colors.purpleSoft,
  },
  addTile: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.purpleSoft,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  action: {
    color: colors.purple,
  },
});
