import { Link } from 'react-router';
import type { RestaurantCardItem } from '../api/restaurants';
import mealThumb from '../assets/illust/meal-thumb.svg';
import { formatDistance, formatScore, joinDot } from '../lib/format';
import { ConquestBadge } from './ConquestBadge';
import styles from './RestaurantCard.module.css';

type Props = {
  item: RestaurantCardItem;
  /** 이름 아래 줄 끝에 붙일 말 (예: 메뉴로 찾았을 때 "메뉴: 칼국수") */
  note?: string | null;
};

/** 검색 결과·추천 목록의 음식점 카드. 누르면 음식점 상세 */
export function RestaurantCard({ item, note }: Props) {
  const score = formatScore(item.rating.score);
  const myOverall = formatScore(item.myOverallScore);
  // 피그마 3-2: "★ 4.6 맛 · 내 종합 4.4 · 재방문 58%"
  const scoreLine = joinDot([
    score ? `★ ${score} 맛` : '아직 별점 없음',
    myOverall ? `내 종합 ${myOverall}` : null,
    item.revisitRate !== null ? `재방문 ${item.revisitRate}%` : null,
  ]);

  return (
    <Link to={`/restaurants/${item.restaurantId}`} className={styles.card}>
      <span className={styles.thumb} aria-hidden="true">
        <img src={mealThumb} alt="" />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.meta}>
          {joinDot([item.categoryName, formatDistance(item.distanceM), note])}
        </span>
        <span className={styles.score}>{scoreLine}</span>
      </span>
      <ConquestBadge state={item.conquestState} />
    </Link>
  );
}
