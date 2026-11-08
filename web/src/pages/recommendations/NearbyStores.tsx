import { getMapRestaurants } from '../../api/restaurants';
import { MenuList } from '../../components/MenuList';
import { boundsAround } from '../../lib/geo';
import type { ViewRegion } from '../../lib/region';
import { useAsync } from '../../lib/useAsync';
import styles from './Recommendations.module.css';

/** 동 중심에서 이만큼(m) 안의 가게를 가까운 순으로 */
const RADIUS_M = 400;
const MAX_ITEMS = 5;

/**
 * 추천할 곳이 아직 없을 때 대신 보여 주는 동네 가게 (MAP-01, 동 중심에서 가까운 순).
 * 동 중심 좌표를 모르거나 가게가 없으면 아무것도 그리지 않는다
 */
export function NearbyStores({ region }: { region: ViewRegion | null }) {
  const lat = region?.lat;
  const lng = region?.lng;
  const { data } = useAsync(
    () =>
      lat && lng
        ? getMapRestaurants(boundsAround({ lat, lng }, RADIUS_M))
        : Promise.resolve({ items: [], totalCount: 0, truncated: false }),
    [lat, lng],
  );
  const items = data?.items.slice(0, MAX_ITEMS) ?? [];
  if (items.length === 0) return null;
  return (
    <section className={styles.nearby} aria-label="동네 가게">
      <h3 className={styles.nearbyTitle}>그동안 동네 가게부터 둘러보세요</h3>
      <MenuList
        label="동네 가게"
        items={items.map((r) => ({
          label: r.name,
          value: r.categoryName ?? undefined,
          to: `/restaurants/${r.restaurantId}`,
        }))}
      />
    </section>
  );
}
