import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { getMemberProfile } from '../../api/profile';
import { AppHeader } from '../../components/AppHeader';
import { ButtonLink } from '../../components/Button';
import { MapView } from '../../components/MapView';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import list from '../list/List.module.css';
import styles from './Explorer.module.css';

/** PICK 지도 /users/:userId/picks — 탐방러가 고른 가게를 지도에 꽂는다 (PROFILE-01 picks) */
export function PickMapPage() {
  const userId = Number(useParams().userId);
  const { data: p, error, reload } = useAsync(() => getMemberProfile(userId), [userId]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 핀 이름 앞에 순서를 붙인다. 모두 탐방러가 직접 정복한 가게
  const pins = useMemo(
    () =>
      (p?.picks ?? []).map((pick) => ({
        restaurantId: pick.restaurantId,
        name: `${pick.order}. ${pick.name}`,
        lat: pick.lat,
        lng: pick.lng,
        conquestState: 'CONQUERED' as const,
      })),
    [p],
  );

  const title = p ? `${p.nickname ?? '탐험가'}의 PICK` : 'PICK 지도';
  if (error || !p) {
    return (
      <Screen>
        <AppHeader title={title} />
        {error ? <EmptyState title={errorMessage(error)} onRetry={reload} /> : <Loading />}
      </Screen>
    );
  }
  if (p.picks.length === 0) {
    return (
      <Screen>
        <AppHeader title={title} />
        <EmptyState title="아직 고른 PICK이 없어요" />
      </Screen>
    );
  }

  const selected = p.picks.find((pick) => pick.restaurantId === selectedId);
  return (
    <Screen>
      <AppHeader title={title} />
      <div className={styles.content}>
        <p className={styles.verified}>✓ 모두 직접 방문 인증한 가게 중에서 고른 곳이에요</p>
        <div className={list.board} role="group" aria-label="PICK 지도">
          <MapView fit pins={pins} selectedId={selectedId} onPinClick={setSelectedId} />
          <span className={list.mapChip}>PICK {p.picks.length}곳</span>
        </div>
        {selected && (
          <section className={list.info} aria-label={`${selected.name} 정보`}>
            <div className={list.infoHead}>
              <p className={list.infoName}>
                {selected.order}. {selected.name}
              </p>
              <button type="button" onClick={() => setSelectedId(null)}>
                닫기
              </button>
            </div>
            <p className={list.infoMeta}>
              {joinDot([
                selected.categoryName,
                `${selected.sigunguName} ${selected.dongName}`,
                `방문 인증 ${selected.visitCount}회`,
              ])}
            </p>
            {selected.comment && <p className={list.infoText}>“{selected.comment}”</p>}
            <ButtonLink to={`/restaurants/${selected.restaurantId}`} size="sm">
              음식점 상세 보기
            </ButtonLink>
          </section>
        )}
        <ol className={styles.rows}>
          {p.picks.map((pick) => (
            <li key={pick.restaurantId}>
              <button
                type="button"
                className={styles.row}
                aria-pressed={pick.restaurantId === selectedId}
                onClick={() => setSelectedId(pick.restaurantId)}
              >
                <span className={styles.order}>{pick.order}</span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{pick.name}</span>
                  <span className={styles.rowMeta}>
                    {joinDot([pick.categoryName, pick.dongName])}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </Screen>
  );
}
