import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';

const PATHS = {
  home: 'M4 10.5 12 4l8 6.5M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8',
  folder:
    'M3.5 8A2.5 2.5 0 0 1 6 5.5h3.4c.6 0 1.1.3 1.5.7l1.2 1.3H18A2.5 2.5 0 0 1 20.5 10v7.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z',
  chat: 'M20 11.5c0 4.1-3.6 7.5-8 7.5-1.1 0-2.2-.2-3.1-.6L4 20l1.4-3.9C4.5 14.9 4 13.2 4 11.5 4 7.4 7.6 4 12 4s8 3.4 8 7.5z',
  book: 'M12 6.8C10.4 5.6 8.1 5 5.2 5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1c2.9 0 5.2.6 6.8 1.8 1.6-1.2 3.9-1.8 6.8-1.8a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1c-2.9 0-5.2.6-6.8 1.8zM12 6.8v13',
  plus: 'M12 5.5v13M5.5 12h13',
  minus: 'M5.5 12h13',
  bell: 'M18 8.5a6 6 0 1 0-12 0c0 5-2.5 6.5-2.5 6.5h17S18 13.5 18 8.5zM13.7 19a2 2 0 0 1-3.4 0',
  document: 'M13.5 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8.5zM13.5 3v5.5H19',
  documentAlert:
    'M13.5 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8.5zM13.5 3v5.5H19M12 11.5v3M12 17.5h.01',
  calendar: 'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM8 3v4M16 3v4M4 10.5h16',
  users:
    'M9 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM2.8 19c.7-3.3 3.2-5 6.2-5s5.5 1.7 6.2 5M16.3 6.3a3.3 3.3 0 0 1 0 6M19 19c-.3-2.6-1.3-4-2.9-4.7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  chevronRight: 'M9.5 6l6 6-6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronUp: 'M6 14.5l6-6 6 6',
  check: 'M5 12.5 10 17.5 19 7',
  flag: 'M5.5 21V3.8M5.5 4.5h11.8l-2.5 4 2.5 4H5.5z',
  exclamation: 'M12 7v6.5M12 17h.01',
  search: 'M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0zM15 15l5.5 5.5',
  chart: 'M4 20V4M4 20h16M8 20v-6M13 20v-9M18 20v-4',
  edit: 'M4 20l1-4.2L15.8 5A2 2 0 0 1 18.6 5l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20zM13.5 6.5l4 4',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M5 7h14M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M7 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5L17 7',
  flame:
    'M12 21c-3.5 0-6-2.4-6-5.8 0-3 1.8-4.8 3-7.2.4 1.6 1.2 2.6 2 2.6-.3-2.6.5-5 3-7.6.4 3 2 4.4 3 6.4 1.2 2.2 1 3.8 1 5.8 0 3.4-2.5 5.8-6 5.8z',
} as const;

export type IconName = keyof typeof PATHS;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** Fills closed shapes (e.g. a priority flag) with this colour. */
  fill?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 20, color = colors.ink, fill = 'none', strokeWidth = 1.7 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fill}
      />
    </Svg>
  );
}
