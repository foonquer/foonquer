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

/** 난이도마다 동그라미 그림: 쉬움 깃발 / 탐험 나침반 / 도전 핀, 완료는 체크 */
export function LevelIcon({ level, done, size }: { level: string; done?: boolean; size?: number }) {
  if (done) return <CheckIcon size={size} />;
  if (level === 'EXPLORE') return <CompassIcon size={size} />;
  if (level === 'CHALLENGE') return <PinIcon size={size} />;
  return <FlagIcon size={size} />;
}
