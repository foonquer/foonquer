import { useRef, useState, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  getMukjjangMap,
  getMySigungus,
  type MukjjangSigungu,
  type MySigungu,
} from '../../api/ranking';
import { getMemberProfile } from '../../api/profile';
import { getMe } from '../../api/users';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { MukkaebiBody } from '../../components/MukkaebiFigure';
import { Screen } from '../../components/Screen';
import { SeasonSelect } from '../../components/SeasonSelect';
import { EmptyState, Loading } from '../../components/StateViews';
import { ApiError, errorMessage } from '../../lib/api';
import { formatSeasonRange, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useBoxSize } from '../../lib/useBoxSize';
import { wearingOf } from '../../lib/wearing';
import { HAN_RIVER, SEOUL_DISTRICTS, SEOUL_VIEWBOX } from '../../data/seoulDistricts';
import { placeLabels, textWidth } from './mapLabels';
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
        <p className={styles.heroSub}>
          {data.totalConquestCount > 0
            ? `${data.sigunguCount}개 구 탐험 중`
            : '첫 맛집을 정복하면 여기에 쌓여요'}
        </p>
        {data.totalConquestCount === 0 && (
          <Link to="/search" className={styles.heroAction}>
            맛집 찾으러 가기 ›
          </Link>
        )}
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
          <p className={styles.muted}>
            {first.activeExplorerCount > 0
              ? `활동 탐험가 ${first.activeExplorerCount}명 중`
              : '아직 이 구에서 정복한 탐험가가 없어요'}
          </p>
        </Link>
      )}

      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>내 동네 · 정복한 구</h2>
        <span>내 동네 먼저 · 정복 많은 순</span>
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

/** 지도 판 안쪽 여백 (%) — 구 이름표가 판 밖으로 잘리지 않게 */
const INSET = 4;
const DISTRICT = new Map(SEOUL_DISTRICTS.map((d) => [d.name, d]));
/** 구 모양 무게중심(피그마 지도 기준)을 판 위 위치(0~1)로. 모양이 없는 구는 중심 좌표로 */
const BOX = { minLat: 37.43, maxLat: 37.7, minLng: 126.79, maxLng: 127.18 };
const fraction = (g: MukjjangSigungu) => {
  const d = DISTRICT.get(g.name);
  const [x, y] = d
    ? [d.label[0] / SEOUL_VIEWBOX.width, d.label[1] / SEOUL_VIEWBOX.height]
    : [
        ((g.centerLng ?? 126.98) - BOX.minLng) / (BOX.maxLng - BOX.minLng),
        (BOX.maxLat - (g.centerLat ?? 37.56)) / (BOX.maxLat - BOX.minLat),
      ];
  const span = (100 - INSET * 2) / 100;
  return { x: INSET / 100 + x * span, y: INSET / 100 + y * span };
};
const position = (g: MukjjangSigungu) => {
  const f = fraction(g);
  return { left: `${f.x * 100}%`, top: `${f.y * 100}%` };
};
/** 지도 위 먹깨비 지름 (px). 가장 가까운 두 구(마포·서대문, 약 29px)도 서로 겹치지 않는 크기 */
const AVATAR = 26;
/** 이름표 높이 (구 이름 + 닉네임 두 줄) */
const LABEL_H = 28;
/** 판 크기를 잴 수 없을 때 (휴대폰 너비) */
const BOARD_FALLBACK = { width: 346, height: 284 };

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
  // 순위가 있는 구가 없으면 내 동네 구부터 보여 준다 — 못 받아도 지도는 그대로
  const me = useAsync(getMe, []).data;
  const [picked, setPicked] = useState<number | null>(initialSigunguId);
  const card = useRef<HTMLElement>(null);
  if (error) return <Failed error={error} onRetry={reload} />;
  if (!data) return <Loading />;

  // 처음에는 내가 순위가 있는 구 → 내 동네 구 → 먹짱이 있는 첫 구
  const homeSigunguId = me?.localRegions[0]?.sigunguId;
  const selected =
    data.items.find((g) => g.sigunguId === picked) ??
    data.items.find((g) => g.myRank !== null) ??
    data.items.find((g) => g.sigunguId === homeSigunguId) ??
    data.items.find((g) => g.mukjjang) ??
    data.items[0];
  const query = seasonId ? `?seasonId=${seasonId}` : '';
  // 구를 누르면 아래 프로필 카드가 화면에 들어오게
  const pick = (sigunguId: number) => {
    setPicked(sigunguId);
    requestAnimationFrame(() =>
      card.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }),
    );
  };

  return (
    <div className={styles.content}>
      <div className={styles.toolbar}>
        <SeasonSelect season={data.season} onChange={onSeason} />
        <span className={styles.hint}>먹깨비를 누르면 그 구의 먹짱을 보여 줘요</span>
      </div>
      <MukjjangMap
        seasonName={data.season.name}
        items={data.items}
        selected={selected}
        onPick={pick}
      />
      {selected && (
        <SelectedCard cardRef={card} g={selected} seasonName={data.season.name} query={query} />
      )}
    </div>
  );
}

/**
 * 서울 지도 위 구별 먹짱. 먹깨비는 구 자리에 그대로, 이름표는 겹치지 않는 쪽(아래·오른쪽·왼쪽·위)에 달고
 * 자리가 없으면 숨긴다. 고른 구는 이름표를 늘 보여 주고 맨 앞에 그린다
 */
function MukjjangMap({
  seasonName,
  items,
  selected,
  onPick,
}: {
  seasonName: string;
  items: MukjjangSigungu[];
  selected: MukjjangSigungu | undefined;
  onPick: (sigunguId: number) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const size = useBoxSize(board, BOARD_FALLBACK);
  const at = (g: MukjjangSigungu) => {
    const f = fraction(g);
    return { x: f.x * size.width, y: f.y * size.height };
  };
  const nickOf = (g: MukjjangSigungu) => g.mukjjang?.nickname ?? '탐험가';
  // 고른 구 → 나 → 정복을 많이 한 먹짱 순서로 이름표 자리를 준다
  const order = items
    .filter((g) => g.mukjjang)
    .sort(
      (a, b) =>
        Number(b.sigunguId === selected?.sigunguId) - Number(a.sigunguId === selected?.sigunguId) ||
        Number(b.mukjjang?.isMe) - Number(a.mukjjang?.isMe) ||
        (b.mukjjang?.conquestCount ?? 0) - (a.mukjjang?.conquestCount ?? 0),
    );
  const sides = placeLabels(
    order.map((g) => ({
      id: g.sigunguId,
      ...at(g),
      label: {
        w: Math.ceil(Math.max(textWidth(g.name, 9), textWidth(nickOf(g), 10.5)) + 14),
        h: LABEL_H,
      },
    })),
    // 먹짱 없는 구 이름은 가리지 않는다
    items
      .filter((g) => !g.mukjjang)
      .map((g) => {
        const p = at(g);
        const w = textWidth(g.name, 10) + 4;
        return { x: p.x - w / 2, y: p.y - 7, w, h: 14 };
      }),
    size,
    AVATAR,
    selected?.sigunguId ?? null,
  );

  return (
    <div
      ref={board}
      className={styles.board}
      role="group"
      aria-label={`${seasonName} 구별 먹짱 지도`}
    >
      <svg
        className={styles.seoul}
        viewBox={`0 0 ${SEOUL_VIEWBOX.width} ${SEOUL_VIEWBOX.height}`}
        // 이름표(position)와 같은 좌표계: 판의 안쪽 여백만큼 줄인 상자 (svg는 너비를 안 주면 판 전체 너비가 된다)
        style={{
          left: `${INSET}%`,
          top: `${INSET}%`,
          width: `${100 - INSET * 2}%`,
          height: `${100 - INSET * 2}%`,
        }}
        aria-hidden="true"
      >
        {/* 고른 구는 테두리가 가려지지 않게 맨 위에 그린다 */}
        {[...SEOUL_DISTRICTS]
          .sort((a, b) => Number(a.name === selected?.name) - Number(b.name === selected?.name))
          .map((d) => {
            const g = items.find((i) => i.name === d.name);
            return (
              <path
                key={d.name}
                d={d.d}
                fill={d.fill}
                data-selected={g !== undefined && g.sigunguId === selected?.sigunguId}
                onClick={g ? () => onPick(g.sigunguId) : undefined}
              />
            );
          })}
        <path d={HAN_RIVER} className={styles.han} />
      </svg>
      {items.map((g) => {
        const isSelected = g.sigunguId === selected?.sigunguId;
        if (!g.mukjjang) {
          return (
            <button
              key={g.sigunguId}
              type="button"
              className={`${styles.marker} ${styles.dot}`}
              style={position(g)}
              aria-pressed={isSelected}
              onClick={() => onPick(g.sigunguId)}
            >
              {g.name}
            </button>
          );
        }
        const side = sides.get(g.sigunguId) ?? null;
        return (
          <button
            key={g.sigunguId}
            type="button"
            className={styles.marker}
            style={position(g)}
            aria-pressed={isSelected}
            aria-label={`${g.name}의 먹짱 ${nickOf(g)}`}
            onClick={() => onPick(g.sigunguId)}
          >
            <img src={g.mukjjang.profileImageUrl ?? mukkaebi} alt="" />
            {side && (
              <span className={styles.markerLabel} data-side={side}>
                <small>{g.name}</small>
                {nickOf(g)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 고른 구의 먹짱 카드: 먹깨비·닉네임·칭호·레벨·신뢰 온도·소개, 내 순위와 TOP 50 */
function SelectedCard({
  cardRef,
  g,
  seasonName,
  query,
}: {
  cardRef: RefObject<HTMLElement | null>;
  g: MukjjangSigungu;
  seasonName: string;
  query: string;
}) {
  const userId = g.mukjjang?.userId;
  // 먹짱 프로필 (PROFILE-01). 못 받아도 지도에서 받은 이름·정복 수는 그대로 보여 준다
  const profile = useAsync(
    () => (userId ? getMemberProfile(userId) : Promise.resolve(null)),
    [userId],
  ).data;
  const m = g.mukjjang;
  const p = profile && profile.userId === userId ? profile : null;
  return (
    <section ref={cardRef} className={styles.selected} aria-label={`${g.name}의 먹짱`}>
      <p className={styles.selectedHead}>
        {g.name}의 먹짱 · {seasonName}
      </p>
      {m ? (
        <div className={styles.profileRow}>
          <Link
            to={`/users/${m.userId}`}
            className={styles.profileFigure}
            aria-hidden="true"
            tabIndex={-1}
          >
            {p ? (
              <MukkaebiBody wearing={wearingOf(p.mukkaebi)} stage={p.mukkaebi.stage} width={52} />
            ) : (
              <img src={m.profileImageUrl ?? mukkaebi} alt="" />
            )}
          </Link>
          <div className={styles.profileText}>
            <p className={styles.selectedRow}>
              <Link
                to={`/users/${m.userId}`}
                className={`${styles.selectedName} ${styles.profileLink}`}
              >
                {m.nickname ?? '탐험가'}
              </Link>
              <span className={styles.selectedCount}>{m.conquestCount}곳 정복</span>
            </p>
            <p className={styles.profileMeta}>
              {joinDot([
                p?.title,
                `LV.${p?.mukkaebi.level ?? m.level}`,
                p && `신뢰 온도 ${p.trustTemp.toFixed(1)}°`,
                p?.homeRegion,
              ])}
            </p>
            {p?.bio && <p className={styles.profileBio}>{p.bio}</p>}
            {p && (
              <p className={styles.profileStats}>
                {joinDot([
                  `누적 정복 ${p.totalConquestCount}곳`,
                  `받은 도움돼요 ${p.helpfulReceived.toLocaleString('ko-KR')}`,
                  p.counts.picks > 0 && `PICK ${p.counts.picks}곳`,
                ])}
              </p>
            )}
            <Link to={`/users/${m.userId}`} className={styles.profileMore}>
              프로필 보기 ›
            </Link>
          </div>
        </div>
      ) : (
        <p className={styles.selectedRow}>
          <span className={styles.selectedName}>아직 먹짱이 없어요</span>
        </p>
      )}
      <p className={styles.selectedFoot}>
        <span>
          {g.myRank !== null
            ? m?.isMe
              ? '내가 이 구의 먹짱이에요!'
              : `내 순위 ${g.myRank}위 · 먹짱까지 ${g.mukjjangGap}곳`
            : '첫 정복으로 순위에 올라 보세요'}
        </span>
        <Link to={`/ranking/sigungus/${g.sigunguId}${query}`}>{g.name} TOP 50 보기 ›</Link>
      </p>
    </section>
  );
}
