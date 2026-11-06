import chevronDown from '../assets/icons/chevron-down.svg';
import locationIcon from '../assets/icons/location.svg';
import { regionLabel, type ViewRegion } from '../lib/region';
import styles from './RegionChip.module.css';

type Props = {
  region: ViewRegion | null;
  onClick: () => void;
  /** map: 지도 위 (그림자, 테두리 없음) / page: 검색·추천 화면 (테두리) */
  variant?: 'map' | 'page';
};

/** "📍 강서구 · 가양동 ⌄" 지역 선택 버튼 */
export function RegionChip({ region, onClick, variant = 'page' }: Props) {
  return (
    <button
      type="button"
      className={styles.chip}
      data-variant={variant}
      onClick={onClick}
      aria-label={region ? `지역 바꾸기 (지금: ${regionLabel(region)})` : '지역 고르기'}
    >
      <img src={locationIcon} alt="" width={12} height={15} />
      <span className={styles.label}>{region ? regionLabel(region) : '지역 고르기'}</span>
      <img src={chevronDown} alt="" width={9} height={5} />
    </button>
  );
}
