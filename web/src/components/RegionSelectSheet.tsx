import { useState } from 'react';
import type { Dong } from '../api/regions';
import { euro } from '../lib/korean';
import { setViewRegion, toViewRegion } from '../lib/region';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { DongFinder } from './DongFinder';
import styles from './RegionSelectSheet.module.css';

type Props = { open: boolean; onClose: () => void };

/** 지역 선택 시트: 동 검색·현재 위치로 한 동네를 골라 홈·검색·추천이 보는 동네를 바꾼다 */
export function RegionSelectSheet({ open, onClose }: Props) {
  const [picked, setPicked] = useState<Dong | null>(null);

  const close = () => {
    setPicked(null);
    onClose();
  };

  const confirm = () => {
    if (!picked) return;
    setViewRegion(toViewRegion(picked));
    close();
  };

  return (
    <BottomSheet open={open} onClose={close} label="지역 선택" height="668px" dim="light">
      <h2 className={styles.title}>지역 선택</h2>
      <div className={styles.body}>
        <DongFinder
          selectedIds={picked ? [picked.regionId] : []}
          onSelect={(dong) => setPicked(picked?.regionId === dong.regionId ? null : dong)}
        />
      </div>
      <Button className={styles.done} onClick={confirm} disabled={!picked}>
        {picked ? `${picked.sigunguName} ${euro(picked.dongName)} 바꾸기` : '선택 완료'}
      </Button>
    </BottomSheet>
  );
}
