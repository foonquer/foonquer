// 퀘스트 화면의 작은 그림 (피그마 12. 맞춤 퀘스트). 글자색(currentColor)으로 칠한다

type Props = { size?: number };

const svg = (size: number, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const CheckIcon = ({ size = 22 }: Props) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />);

export const CompassIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </>,
  );

export const PinIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>,
  );

export const FlagIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 4L17 12H6" />
    </>,
  );

export const GiftIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M3 9h18M12 9v11" />
      <path d="M12 9c-1.5-3.5-5-4-5-1.6C7 9 12 9 12 9zM12 9c1.5-3.5 5-4 5-1.6C17 9 12 9 12 9z" />
    </>,
  );

export const SparkleIcon = ({ size = 22 }: Props) =>
  svg(size, <path d="M12 4l1.8 6.2L20 12l-6.2 1.8L12 20l-1.8-6.2L4 12l6.2-1.8z" />);

export const RefreshIcon = ({ size = 16 }: Props) =>
  svg(
    size,
    <>
      <path d="M20 11a8 8 0 00-14.6-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0014.6 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </>,
  );

export const AwardIcon = ({ size = 24 }: Props) =>
  svg(
    size,
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.5L8 21l4-2 4 2-1-7.5" />
    </>,
  );

export const CloseIcon = ({ size = 18 }: Props) => svg(size, <path d="M7 7l10 10M17 7L7 17" />);

/* 모임 (피그마 12. 모임) */
export const UsersIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.5-3.6 3.1-5.5 6.5-5.5s6 1.9 6.5 5.5" />
      <path d="M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.7.8 2.8 2.5 3 5.2" />
    </>,
  );

export const HomeIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <path d="M4 10.5L12 4l8 6.5V20H4z" />
      <path d="M10 20v-5h4v5" />
    </>,
  );

export const HeartIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.6 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z" />,
  );

/** 함께 정복 (포크와 나이프) */
export const UtensilsIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <path d="M7 3v7a2 2 0 002 2v9M11 3v7a2 2 0 01-2 2M9 3v6" />
      <path d="M17 21V3c-2 1.5-3 4-3 7v3h3" />
    </>,
  );

/** 맛집 나눠 찾기 (한 곳에서 갈라지는 길) */
export const SplitIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7.5 7.7L11 15.8M16.5 7.7L13 15.8" />
    </>,
  );

export const LinkIcon = ({ size = 20 }: Props) =>
  svg(
    size,
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </>,
  );

export const LockIcon = ({ size = 20 }: Props) =>
  svg(
    size,
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 018 0v3" />
    </>,
  );

export const SearchIcon = ({ size = 20 }: Props) =>
  svg(
    size,
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>,
  );

export const EyeIcon = ({ size = 18 }: Props) =>
  svg(
    size,
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>,
  );

export const EyeOffIcon = ({ size = 18 }: Props) =>
  svg(
    size,
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 6A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-3 3.7M6.5 7.6A16 16 0 002.5 12S6 18.5 12 18.5a9 9 0 004-1" />
    </>,
  );

export const PlusIcon = ({ size = 18 }: Props) => svg(size, <path d="M12 5v14M5 12h14" />);

export const GearIcon = ({ size = 22 }: Props) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>,
  );

/** 난이도마다 동그라미 그림: 쉬움 깃발 / 탐험 나침반 / 도전 핀, 완료는 체크 */
export function LevelIcon({ level, done, size }: { level: string; done?: boolean; size?: number }) {
  if (done) return <CheckIcon size={size} />;
  if (level === 'EXPLORE') return <CompassIcon size={size} />;
  if (level === 'CHALLENGE') return <PinIcon size={size} />;
  return <FlagIcon size={size} />;
}
