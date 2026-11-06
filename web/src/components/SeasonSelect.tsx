import { useState } from 'react';
import { getSeasons, type Season } from '../api/ranking';
import { errorMessage } from '../lib/api';
import { formatSeasonRange } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { BottomSheet } from './BottomSheet';
import { EmptyState, Loading } from './StateViews';
import styles from './SeasonSelect.module.css';

type Props = {
  /** 지금 보는 시즌 (없으면 진행 중 시즌) */
  season: Season | null;
  onChange: (seasonId: number) => void;
};

/** "시즌 3 ⌄" 버튼과 시즌 고르기 시트 (RANK-02) */
export function SeasonSelect({ season, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { data, error, reload } = useAsync(
    () => (open ? getSeasons() : Promise.resolve(null)),
    [open],
  );

  return (
    <>
      <button type="button" className={styles.button} onClick={() => setOpen(true)}>
        {season?.name ?? '시즌'} <span aria-hidden="true">⌄</span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} label="시즌 선택" dim="light">
        <h2 className={styles.title}>시즌 선택</h2>
        {error ? <EmptyState title={errorMessage(error)} onRetry={reload} /> : !data && <Loading />}
        <ul className={styles.list}>
          {data?.items.map((s) => (
            <li key={s.seasonId}>
              <button
                type="button"
                className={styles.item}
                aria-current={s.seasonId === season?.seasonId}
                onClick={() => {
                  onChange(s.seasonId);
                  setOpen(false);
                }}
              >
                <span className={styles.name}>
                  {s.name}
                  {s.status === 'ACTIVE' && <span className={styles.active}>진행 중</span>}
                </span>
                <span className={styles.range}>
                  {formatSeasonRange(s)}
                  {s.status === 'ACTIVE' && ` · D-${s.daysLeft}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
