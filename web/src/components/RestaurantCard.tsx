import { Link } from 'react-router';
import type { RestaurantCardItem } from '../api/restaurants';
import { formatDistance, formatScore, joinDot, noRatingText } from '../lib/format';
import { ConquestBadge } from './ConquestBadge';
import { FoodImage } from './FoodImage';
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
    score ? `★ ${score} 맛` : noRatingText(item.rating.reviewCount, true),
    myOverall ? `내 종합 ${myOverall}` : null,
    item.revisitRate !== null ? `재방문 ${item.revisitRate}%` : null,
  ]);

  return (
    <Link to={`/restaurants/${item.restaurantId}`} className={styles.card}>
      <span className={styles.thumb}>
        <FoodImage imageUrl={item.imageUrl} categoryName={item.categoryName} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.meta}>
          {joinDot([
            item.categoryName,
            // "한식 · 해장국": 같은 한식끼리도 무엇을 파는지 보이게
            item.categoryDetail !== item.categoryName ? item.categoryDetail : null,
            formatDistance(item.distanceM),
            note,
          ])}
        </span>
        <span className={styles.score}>{scoreLine}</span>
      </span>
      <ConquestBadge state={item.conquestState} />
    </Link>
  );
}
