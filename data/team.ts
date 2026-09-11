import { colors } from '../theme';

export type TeamId = 'ahmed' | 'zara' | 'bilal' | 'ayesha';

export type Member = {
  id: TeamId;
  initials: string;
  name: string;
  bg: string;
  fg: string;
};

export const TEAM: Record<TeamId, Member> = {
  ahmed: { id: 'ahmed', initials: 'AH', name: 'Ahmed', bg: colors.purple, fg: colors.onInk },
  zara: { id: 'zara', initials: 'ZK', name: 'Zara', bg: '#F0B429', fg: '#4A3300' },
  // Identity tints, deeper than the status soft colours so these avatars still read on white.
  bilal: { id: 'bilal', initials: 'BM', name: 'Bilal', bg: '#BDE8D3', fg: '#0B5E3E' },
  ayesha: { id: 'ayesha', initials: 'AR', name: 'Ayesha', bg: '#FBE3A0', fg: '#7A5200' },
};

export const TEAM_ORDER: TeamId[] = ['ahmed', 'zara', 'bilal', 'ayesha'];

/** The logged-in user for this prototype — no auth yet, so it's fixed. */
export const CURRENT_USER_ID: TeamId = 'ahmed';
