import type { MapRestaurant } from '../../api/restaurants';
import { BottomSheet } from '../../components/BottomSheet';
import { MenuList } from '../../components/MenuList';
import styles from './NearbySheet.module.css';

type Props = {
  /** 누른 자리 근처 가게 (가까운 순). null이면 닫힘 */
  items: MapRestaurant[] | null;
  onPick: (restaurantId: number) => void;
  onClose: () => void;
};

/** 지도를 누른 자리에 가게가 여러 곳일 때 고르는 시트 */
export function NearbySheet({ items, onPick, onClose }: Props) {
  return (
    <BottomSheet open={items !== null} onClose={onClose} label="이 자리의 가게" dim="light">
      <h2 className={styles.title}>이 자리의 가게</h2>
      <MenuList
        label="이 자리의 가게"
        items={(items ?? []).map((r) => ({
          label: r.name,
          value: r.categoryName ?? undefined,
          onClick: () => onPick(r.restaurantId),
        }))}
      />
    </BottomSheet>
  );
}
