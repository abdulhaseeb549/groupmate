import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { NavTab } from '../components/BottomNav';
import { DistributionModal } from '../components/DistributionModal';
import { PollCard } from '../components/PollCard';
import { WorkDivision } from '../components/WorkDivision';
import { TEAM, TEAM_ORDER } from '../data/team';
import { useProject } from '../state/ProjectRepository';
import { colors, gradients, layout, spacing, type } from '../theme';

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
};

export function ChatScreen({ onSelectTab }: Props) {
  const [distributionOpen, setDistributionOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { project, tasks } = useProject();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 100 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => onSelectTab('home')}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M15 5l-7 7 7 7" stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={type.projectTitle}>{project.team}</Text>
            <Text style={[type.subtitle, { color: colors.muted }]}>4 members · {project.name}</Text>
          </View>
          <View style={styles.avatarStack}>
            <Avatar {...TEAM.zara} size={30} borderColor={colors.bg} />
            <Avatar {...TEAM.bilal} size={30} borderColor={colors.bg} style={{ marginLeft: -10 }} />
            <Avatar {...TEAM.ayesha} size={30} borderColor={colors.bg} style={{ marginLeft: -10 }} />
          </View>
        </View>

        {/* GroupMate bot message: plan generated + work division */}
        <View style={styles.messageGroup}>
          <MessageMeta
            icon={
              <View style={styles.botIcon}>
                <Svg width={15} height={15} viewBox="0 0 24 24" fill={colors.purple}>
                  <Path d="M12 2.8l2.2 6.5 6.5 2.2-6.5 2.2L12 20.2l-2.2-6.5L3.3 11.5l6.5-2.2z" />
                </Svg>
              </View>
            }
            name="GroupMate"
            nameColor={colors.purple}
            time="Mon 09:14"
          />
          <Text style={[type.body, styles.bubbleText]}>
            I read your brief — 7 requirements, 3 deliverables, due 10 Oct. Here's the
            Balanced plan, divided evenly across the team.
          </Text>
          <Pressable onPress={() => setDistributionOpen(true)}>
            <WorkDivision
              assignees={TEAM_ORDER.map((id) => ({
                ...TEAM[id],
                taskCount: tasks.filter((t) => t.assigneeId === id).length,
              }))}
            />
          </Pressable>
          <Text style={[type.statLabel, { color: colors.muted, paddingLeft: 4 }]}>
            Tap to make quick changes
          </Text>
        </View>

        <SystemDivider text="Zara and Bilal joined" />

        <View style={styles.messageGroup}>
          <MessageMeta avatar={TEAM.bilal} name={TEAM.bilal.name} time="10:02" />
          <Text style={[type.body, styles.bubbleText, { paddingLeft: 40 }]}>
            Taking the financials. Someone grab the deck?
          </Text>
        </View>

        <SystemDivider text={'Bilal moved "Revenue forecast" to Doing'} />

        {/* Poll */}
        <View style={styles.messageGroup}>
          <MessageMeta avatar={TEAM.ahmed} name="You" time="10:14" />
          <View style={{ paddingLeft: 40 }}>
            <PollCard
              question="When should we meet to review the draft?"
              options={[
                { id: 'tonight', label: 'Tonight, 8pm', votes: 2 },
                { id: 'tomorrow', label: 'Tomorrow after class', votes: 1 },
                { id: 'sunday', label: 'Sunday afternoon', votes: 0 },
              ]}
            />
          </View>
        </View>

        {/* Whiteboard photo message */}
        <View style={styles.messageGroup}>
          <MessageMeta avatar={TEAM.zara} name={TEAM.zara.name} time="yesterday" />
          <View style={{ paddingLeft: 40, gap: 10 }}>
            <Text style={[type.body, styles.bubbleText]}>
              Photo of the whiteboard from our session — the segment split is on the right.
            </Text>
            <View style={styles.photoWrap}>
              <Svg width="100%" height={150} viewBox="0 0 300 150">
                <Rect width={300} height={150} fill="#F0EEE9" />
                <G fill="none" stroke="#3E5FA8" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <Rect x={18} y={22} width={66} height={36} rx={5} />
                  <Rect x={18} y={86} width={66} height={36} rx={5} />
                  <Path d="M84 40h30" />
                  <Path d="M107 34l7 6-7 6" />
                  <Path d="M84 104h30" />
                  <Path d="M107 98l7 6-7 6" />
                  <Rect x={118} y={54} width={60} height={40} rx={5} />
                </G>
                <G fill="none" stroke="#8A6BB0" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M178 74h26" />
                  <Path d="M197 68l7 6-7 6" />
                  <Path d="M214 38c26-8 58 6 54 24-3 19-43 28-60 15-13-10-6-30 6-39z" />
                </G>
              </Svg>
              <View style={styles.photoBadge}>
                <View style={styles.photoDot} />
                <Text style={[type.tinyLabel, { color: colors.onInk }]}>
                  Original · 4.2 MB · not compressed
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.composerRow, { bottom: Math.max(insets.bottom, 10) + 16 }]}>
        <Pressable style={styles.attachButton}>
          <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
            <Path d="M12 6v12M6 12h12" stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round" />
          </Svg>
        </Pressable>
        <View style={styles.composerInput}>
          <Text style={[type.body, { color: colors.faint }]}>Message {project.team}…</Text>
        </View>
        <Pressable>
          <LinearGradient
            colors={gradients.purpleDeep}
            start={{ x: 0.25, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={styles.sendButton}
          >
            <LinearGradient colors={gradients.sheen} style={styles.sendSheen} />
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 12h13M12.5 6.5 19 12l-6.5 5.5"
                stroke={colors.onInk}
                strokeWidth={2.1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </LinearGradient>
        </Pressable>
      </View>

      <DistributionModal visible={distributionOpen} onClose={() => setDistributionOpen(false)} />
    </View>
  );
}

function MessageMeta({
  avatar,
  icon,
  name,
  nameColor,
  time,
}: {
  avatar?: { initials: string; bg: string; fg: string };
  icon?: React.ReactNode;
  name: string;
  nameColor?: string;
  time: string;
}) {
  return (
    <View style={styles.metaRow}>
      {avatar ? <Avatar {...avatar} size={30} /> : icon}
      <Text style={[type.button, { color: nameColor ?? colors.ink, flex: 1 }]}>{name}</Text>
      <Text style={[type.statLabel, { color: colors.muted }]}>{time}</Text>
    </View>
  );
}

function SystemDivider({ text }: { text: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerPill}>
        <Text style={[type.tinyLabel, { color: colors.muted }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3C3255',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  avatarStack: {
    flexDirection: 'row',
  },
  messageGroup: {
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  botIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleText: {
    color: colors.ink,
  },
  dividerRow: {
    alignItems: 'center',
  },
  dividerPill: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  photoBadge: {
    position: 'absolute',
    left: 9,
    bottom: 9,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#7BD3A0',
  },
  composerRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attachButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3C3255',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  composerInput: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#3C3255',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sendButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: colors.purple,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  sendSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '58%',
  },
});
