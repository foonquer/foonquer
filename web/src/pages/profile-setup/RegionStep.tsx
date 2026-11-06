import { useState } from 'react';
import { findDongHere, type Dong } from '../../api/regions';
import pinIcon from '../../assets/icons/location-pin-32.svg';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { DongFinder } from '../../components/DongFinder';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { StepHeader } from './StepHeader';
import styles from './ProfileSetup.module.css';

/** 내 동네는 최대 3곳 (서버 LOCAL_REGION_COUNT_INVALID와 같다) */
const MAX_REGIONS = 3;

type Props = {
  regions: Dong[];
  onChange: (regions: Dong[]) => void;
  onSubmit: () => void;
  saving: boolean;
};

/** S-06 내 동네 (REGION-01 동 검색 · REGION-02 현재 위치 · 위치 권한이 꺼지면 구·동 목록에서 직접 고르기) */
export function RegionStep({ regions, onChange, onSubmit, saving }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<'search' | 'picker'>('search');
  const [deniedOpen, setDeniedOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const selectedIds = regions.map((r) => r.regionId);

  const add = (dong: Dong) => {
    if (selectedIds.includes(dong.regionId)) return;
    if (regions.length >= MAX_REGIONS) {
      toast(`내 동네는 최대 ${MAX_REGIONS}곳까지 고를 수 있어요.`);
      return;
    }
    onChange([...regions, dong]);
  };
  const remove = (regionId: number) => onChange(regions.filter((r) => r.regionId !== regionId));
  // 목록에서 이미 고른 동네를 다시 누르면 뺀다
  const toggle = (dong: Dong) =>
    selectedIds.includes(dong.regionId) ? remove(dong.regionId) : add(dong);

  const retry = async () => {
    setRetrying(true);
    try {
      add(await findDongHere());
      setDeniedOpen(false);
    } catch (err) {
      if (err === 'DENIED') toast('아직 위치 권한이 꺼져 있어요.');
      else if (err === 'UNAVAILABLE') toast('지금 위치를 찾지 못했어요.');
      else toast(errorMessage(err));
    } finally {
      setRetrying(false);
    }
  };

  const pickByHand = () => {
    setMode('picker');
    setDeniedOpen(false);
  };

  return (
    <Screen
      footer={
        <>
          {regions.length > 0 && (
            <div className={styles.selectedArea}>
              <p className={styles.selectedCount}>
                고른 동네 {regions.length} / {MAX_REGIONS}
              </p>
              <ul className={styles.selectedChips}>
                {regions.map((r) => (
                  <li key={r.regionId}>
                    <button
                      type="button"
                      className={styles.selectedChip}
                      onClick={() => remove(r.regionId)}
                      aria-label={`${r.sigunguName} ${r.dongName} 빼기`}
                    >
                      {r.sigunguName} {r.dongName}
                      <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button onClick={onSubmit} disabled={regions.length === 0 || saving}>
            {regions.length === 0 ? '선택 완료' : `${regions.length}곳으로 시작하기`}
          </Button>
        </>
      }
    >
      <StepHeader
        step={3}
        name="내 동네"
        title={'자주 가는 동네를\n골라주세요'}
        description={`집·직장 근처 등 최대 ${MAX_REGIONS}곳까지 고를 수 있어요`}
      />
      <div className={styles.regionContent}>
        <DongFinder
          mode={mode}
          selectedIds={selectedIds}
          onSelect={toggle}
          onLocationDenied={() => setDeniedOpen(true)}
        />
      </div>

      <BottomSheet open={deniedOpen} onClose={() => setDeniedOpen(false)} label="위치 권한 안내">
        <span className={styles.sheetIcon}>
          <img src={pinIcon} alt="" width={32} height={32} />
        </span>
        <h2 className={styles.sheetTitle}>위치 권한이 꺼져 있어요</h2>
        <p className={styles.sheetText}>
          {'위치를 허용하면 지금 있는 동네를 바로 찾아 드려요.\n직접 골라도 괜찮아요.'}
        </p>
        <ol className={styles.steps}>
          <li>1. 주소창 왼쪽의 자물쇠 아이콘 누르기</li>
          <li>2. 위치를 ‘허용’으로 바꾸고 새로고침하기</li>
        </ol>
        <div className={styles.sheetButtons}>
          <Button variant="soft" radius={16} onClick={retry} disabled={retrying}>
            다시 시도
          </Button>
          <Button radius={16} onClick={pickByHand}>
            직접 고를게요
          </Button>
        </div>
      </BottomSheet>
    </Screen>
  );
}
