import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  getMukjjangMap,
  getMySigungus,
  type MukjjangSigungu,
  type MySigungu,
} from '../../api/ranking';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { Screen } from '../../components/Screen';
import { SeasonSelect } from '../../components/SeasonSelect';
import { EmptyState, Loading } from '../../components/StateViews';
import { ApiError, errorMessage } from '../../lib/api';
import { formatSeasonRange } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import styles from './Ranking.module.css';

type Tab = 'status' | 'rank';

/** 시즌이 없을 때·불러오지 못했을 때 */
function Failed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.code === 'NO_ACTIVE_SEASON') {
    return (
      <EmptyState title="진행 중인 시즌이 없어요" description="새 시즌이 시작되면 순위가 열려요." />
    );
  }
  return <EmptyState title={errorMessage(error)} onRetry={onRetry} />;
}

/**
 * 랭킹/현황 탭 /ranking?tab=status|rank&seasonId=
 * 순위 변동 알림은 /ranking?sigunguId=로 온다 (NOTI-01 deepLink) → 랭킹 탭에서 그 구를 고른다
 */
export function RankingPage() {
  const [params, setParams] = useSearchParams();
  const sigunguId = Number(params.get('sigunguId')) || null;
  const tab: Tab =
    params.get('tab') === 'rank' || (sigunguId && !params.get('tab')) ? 'rank' : 'status';
  const seasonId = Number(params.get('seasonId')) || undefined;
  const set = (patch: Record<string, string>) =>
    setParams({ ...Object.fromEntries(params), ...patch }, { replace: true });

  return (
    <Screen inTab>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>현황 / 랭킹</h1>
          <p className={styles.sub}>
            {tab === 'status' ? '구별 정복 현황' : '구별 먹짱 · 시즌 정복 수 기준'}
          </p>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="현황 / 랭킹">
          {(
            [
              ['status', '현황'],
              ['rank', '랭킹'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => set({ tab: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'status' ? (
        <StatusTab seasonId={seasonId} onSeason={(id) => set({ seasonId: String(id) })} />
      ) : (
        <RankTab
          // 알림 링크로 다른 구가 열리면 고른 구를 새로 정한다
          key={sigunguId ?? 'none'}
          seasonId={seasonId}
          initialSigunguId={sigunguId}
          onSeason={(id) => set({ seasonId: String(id) })}
        />
      )}
    </Screen>
  );
}

const progressOf = (s: { conquestCount: number; nextTier: { remaining: number } | null }) =>
  s.nextTier ? (s.conquestCount / (s.conquestCount + s.nextTier.remaining)) * 100 : 100;

/** 현황: 내 구별 정복 (RANK-03) */
function StatusTab({ seasonId, onSeason }: { seasonId?: number; onSeason: (id: number) => void }) {
  const { data, error, reload } = useAsync(() => getMySigungus(seasonId), [seasonId]);
  if (error) return <Failed error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const first: MySigungu | undefined = data.items[0];
  const query = seasonId ? `?seasonId=${seasonId}` : '';
  return (
    <div className={styles.content}>
      <div className={styles.toolbar}>
        <SeasonSelect season={data.season} onChange={onSeason} />
        <span className={styles.hint}>{formatSeasonRange(data.season)}</span>
      </div>
      <section className={styles.hero} aria-label="이번 시즌 정복">
        <p className={styles.heroTitle}>총 {data.totalConquestCount}곳 정복</p>
        <p className={styles.heroSub}>{data.sigunguCount}개 구 탐험 중</p>
      </section>

      {first && (
        <Link to={`/ranking/sigungus/${first.sigunguId}/status${query}`} className={styles.card}>
          <p className={styles.cardHead}>
            <strong>{first.sigunguName} 내 순위</strong>
            <span>{data.season.name} · 정복 수</span>
          </p>
          <p className={styles.rankLine}>
            <span className={styles.rankBig}>{first.rank ? `${first.rank}위` : '–'}</span>
            {first.topPercent !== null && (
              <span className={styles.top}>상위 {first.topPercent}%</span>
            )}
            <span className={styles.chip}>{first.sigunguName}</span>
          </p>
          <p className={styles.muted}>활동 탐험가 {first.activeExplorerCount}명 중</p>
        </Link>
      )}

      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>내가 정복한 구</h2>
        <span>내 동네 · 정복 많은 순</span>
      </div>
      {data.items.length === 0 ? (
        <EmptyState
          title="아직 정복한 구가 없어요"
          description="가게를 방문 인증하고 맛 별점을 남기면 정복이 시작돼요."
        />
      ) : (
        data.items.map((s) => (
          <Link
            key={s.sigunguId}
            to={`/ranking/sigungus/${s.sigunguId}/status${query}`}
            className={styles.sigungu}
          >
            <span className={styles.sigunguTop}>
              <span className={styles.sigunguName}>
                {s.sigunguName}
                {s.isLocal && <span className={styles.local}>내 동네</span>}
              </span>
              <span className={styles.next}>
                {s.nextTier ? `${s.nextTier.tierName}까지 ${s.nextTier.remaining}곳` : '최고 티어'}
              </span>
            </span>
            <span className={styles.sigunguBottom}>
              <span className={styles.tierLine}>
                {s.tierName} · {s.conquestCount}곳 정복
              </span>
              <span className={styles.rankSmall}>{s.rank ? `${s.rank}위` : '순위 없음'}</span>
            </span>
            <span className={styles.bar} aria-hidden="true">
              <span style={{ width: `${progressOf(s)}%` }} />
            </span>
          </Link>
        ))
      )}
      <p className={styles.note}>
        순위와 티어 모두 {data.season.name}({formatSeasonRange(data.season)}) 기준이에요.
      </p>
    </div>
  );
}

/** 서울 25개 구 중심 좌표를 판 위 위치(%)로 */
const BOX = { minLat: 37.43, maxLat: 37.7, minLng: 126.79, maxLng: 127.18 };
const position = (g: MukjjangSigungu) => ({
  left: `${(((g.centerLng ?? 126.98) - BOX.minLng) / (BOX.maxLng - BOX.minLng)) * 88 + 6}%`,
  top: `${((BOX.maxLat - (g.centerLat ?? 37.56)) / (BOX.maxLat - BOX.minLat)) * 86 + 7}%`,
});

/** 랭킹: 구별 먹짱 지도 (RANK-06) */
function RankTab({
  seasonId,
  initialSigunguId,
  onSeason,
}: {
  seasonId?: number;
  initialSigunguId: number | null;
  onSeason: (id: number) => void;
}) {
  const { data, error, reload } = useAsync(() => getMukjjangMap(seasonId), [seasonId]);
  const [picked, setPicked] = useState<number | null>(initialSigunguId);
  if (error) return <Failed error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  // 처음에는 내가 순위가 있는 구 (없으면 먹짱이 있는 첫 구)
  const selected =
    data.items.find((g) => g.sigunguId === picked) ??
    data.items.find((g) => g.myRank !== null) ??
    data.items.find((g) => g.mukjjang) ??
    data.items[0];
  const query = seasonId ? `?seasonId=${seasonId}` : '';

  return (
    <div className={styles.content}>
      <div className={styles.toolbar}>
        <SeasonSelect season={data.season} onChange={onSeason} />
        <span className={styles.hint}>구를 누르면 그 구의 먹짱을 보여 줘요</span>
      </div>
      <div className={styles.board} role="group" aria-label={`${data.season.name} 구별 먹짱 지도`}>
        <span className={styles.river} aria-hidden="true" />
        {data.items.map((g) =>
          g.mukjjang ? (
            <button
              key={g.sigunguId}
              type="button"
              className={styles.marker}
              style={position(g)}
              aria-pressed={g.sigunguId === selected?.sigunguId}
              onClick={() => setPicked(g.sigunguId)}
            >
              <img src={g.mukjjang.profileImageUrl ?? mukkaebi} alt="" />
              <span className={styles.markerLabel}>
                <small>{g.name}의 먹짱</small>
                {g.mukjjang.nickname}
              </span>
            </button>
          ) : (
            <button
              key={g.sigunguId}
              type="button"
              className={`${styles.marker} ${styles.dot}`}
              style={position(g)}
              aria-pressed={g.sigunguId === selected?.sigunguId}
              onClick={() => setPicked(g.sigunguId)}
            >
              {g.name}
            </button>
          ),
        )}
      </div>

      {selected && (
        <section className={styles.selected} aria-label={`${selected.name}의 먹짱`}>
          <p className={styles.selectedHead}>
            {selected.name}의 먹짱 · {data.season.name}
          </p>
          <p className={styles.selectedRow}>
            <span className={styles.selectedName}>
              {selected.mukjjang ? (
                <Link to={`/users/${selected.mukjjang.userId}`} className={styles.profileLink}>
                  {selected.mukjjang.nickname}
                </Link>
              ) : (
                '아직 먹짱이 없어요'
              )}
            </span>
            {selected.mukjjang && (
              <span className={styles.selectedCount}>{selected.mukjjang.conquestCount}곳 정복</span>
            )}
          </p>
          <p className={styles.selectedFoot}>
            <span>
              {selected.myRank !== null
                ? selected.mukjjang?.isMe
                  ? '내가 이 구의 먹짱이에요!'
                  : `내 순위 ${selected.myRank}위 · 먹짱까지 ${selected.mukjjangGap}곳`
                : '첫 정복으로 순위에 올라 보세요'}
            </span>
            <Link to={`/ranking/sigungus/${selected.sigunguId}${query}`}>
              {selected.name} TOP 50 보기 ›
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
