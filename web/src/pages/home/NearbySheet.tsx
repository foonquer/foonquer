import type { NearbyPlace } from '../../api/restaurants';
import { BottomSheet } from '../../components/BottomSheet';
import { MenuList } from '../../components/MenuList';
import styles from './NearbySheet.module.css';

type Props = {
  /** 누른 자리 근처 음식점 (가까운 순). null이면 닫힘 */
  places: NearbyPlace[] | null;
  onPick: (restaurantId: number) => void;
  onClose: () => void;
};

/** 지도를 누른 자리 근처 음식점 중에서 고르는 시트. 먹장깨기에 없는 가게는 회색으로 보여 주기만 한다 */
export function NearbySheet({ places, onPick, onClose }: Props) {
  return (
    <BottomSheet open={places !== null} onClose={onClose} label="이 근처 음식점" dim="light">
      <h2 className={styles.title}>이 근처 음식점</h2>
      <MenuList
        label="이 근처 음식점"
        items={(places ?? []).map(({ name, restaurantId, categoryName }) =>
          restaurantId === null
            ? { label: name, value: '먹장깨기에 없어요', muted: true }
            : {
                label: name,
                value: categoryName ?? undefined,
                onClick: () => onPick(restaurantId),
              },
        )}
      />
    </BottomSheet>
  );
}
