import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { useNavigation } from '../state/NavigationProvider';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Board GSwitcher: picks which project the app is showing, and offers a way
 * to add another.
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
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, 0) + 34 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header">
          Your projects
        </Text>

        <View style={styles.list} accessibilityLabel="Projects">
          {projects.map((item) => {
            const active = item.id === project.id;
            return (
              <View key={item.id}>
                <Pressable
                  onPress={() => pick(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${item.name}${active ? ', current project' : ''}`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={[styles.tile, active && styles.tileActive]}>
                    <Icon name="folder" size={20} color={active ? colors.purple : colors.muted} strokeWidth={1.8} />
                  </View>
                  <View style={styles.text}>
                    <Text style={[styles.t, active && styles.tStrong]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.m} numberOfLines={1}>
                      {item.course} · {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
                      {item.role === 'owner' ? '' : ' · joined'}
                    </Text>
                  </View>
                  {active ? <Icon name="tick" size={20} color={colors.purple} strokeWidth={2.4} /> : null}
                </Pressable>
                <View style={styles.sep} />
              </View>
            );
          })}

          <Pressable
            onPress={() => {
              onClose();
              openNewProject();
            }}
            accessibilityRole="button"
            accessibilityLabel="New project, read another brief"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            {/* Dashed: this adds something rather than switching to something. */}
            <View style={styles.addTile}>
              <Icon name="plus" size={20} color={colors.purple} strokeWidth={2.2} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.t, styles.tStrong, styles.action]} numberOfLines={1}>
                New project
              </Text>
              <Text style={styles.m} numberOfLines={1}>
                Read another brief
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
  },
  title: {
    paddingTop: 14,
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  list: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.6,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ECEAF0',
    marginLeft: 58,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileActive: {
    backgroundColor: '#F0ECFF',
  },
  addTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#C9BDF5',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  tStrong: {
    fontFamily: type.sectionHeading.fontFamily,
  },
  action: {
    color: colors.purple,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
});
