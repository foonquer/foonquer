import coin from '../assets/illust/coin.svg';
import nightsky from '../assets/illust/mukkaebi-nightsky.svg';
import { itemArt } from '../lib/itemArt';
import styles from './AchievementIcon.module.css';

/** 보상 아이템이 있는 업적은 그 그림 (피그마 탐방러 프로필 / 업적 전체 319:5565), 나머지는 먹포인트 코인 */
const REWARD_ART: Record<string, string | undefined> = {
  ACH_MUKJJANG: itemArt('HAT_CROWN'),
  ACH_SEASON_CONQUEST_30: itemArt('CLUB_GOLD'),
  ACH_SEASON_TOP10: nightsky,
};

type Props = { iconKey: string | null; size?: number; done?: boolean };

/** 업적 동그라미 아이콘 (iconKey = ACH_업적코드). 못 받은 업적은 흐리게 */
export function AchievementIcon({ iconKey, size = 52, done = true }: Props) {
  const reward = iconKey ? REWARD_ART[iconKey] : undefined;
  return (
    <span
      className={styles.icon}
      data-reward={Boolean(reward)}
      data-done={done}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img src={reward ?? coin} alt="" style={{ width: reward ? '72%' : '56%' }} />
    </span>
  );
}
