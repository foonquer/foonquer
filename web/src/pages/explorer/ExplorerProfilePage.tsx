import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  blockMember,
  getMemberProfile,
  getVisitedRestaurants,
  type MemberProfile,
  unblockMember,
} from '../../api/profile';
import { getSeasons } from '../../api/ranking';
import { getMemberReviews } from '../../api/reviews';
import { AchievementIcon } from '../../components/AchievementIcon';
import { AppHeader } from '../../components/AppHeader';
import { BottomSheet } from '../../components/BottomSheet';
import { Button, ButtonLink } from '../../components/Button';
import { MukkaebiFigure } from '../../components/MukkaebiFigure';
import { ReviewCard } from '../../components/ReviewCard';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { formatKoreanDate, formatMonthDay, formatScore, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { usePaged } from '../../lib/usePaged';
import { wearingOf } from '../../lib/wearing';
import styles from './Explorer.module.css';

const TABS = ['pick', 'visited', 'reviews'] as const;
type Tab = (typeof TABS)[number];

/** 탐방러 프로필 /users/:userId?tab=pick|visited|reviews (PROFILE-01·02, REVIEW-10, BLOCK-01·02) */
export function ExplorerProfilePage() {
  const userId = Number(useParams().userId);
  const { data, error, reload, mutate } = useAsync(() => getMemberProfile(userId), [userId]);

  if (error) {
    const gone = error instanceof ApiError && error.status === 404;
    return (
      <Screen>
        <AppHeader title="탐방러 프로필" />
        <EmptyState
          title={gone ? '탐험가를 찾을 수 없어요' : errorMessage(error)}
          description={gone ? '탈퇴했거나 이용이 정지된 탐험가예요.' : undefined}
          onRetry={gone ? undefined : reload}
        />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="탐방러 프로필" />
        <Loading />
      </Screen>
    );
  }
  return <Profile p={data} onBlocked={(isBlocked) => mutate((prev) => ({ ...prev, isBlocked }))} />;
}

function Profile({ p, onBlocked }: { p: MemberProfile; onBlocked: (blocked: boolean) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = p.nickname ?? '탐험가';
  const tab: Tab =
    TABS.find((t) => t === params.get('tab')) ?? (p.counts.picks > 0 ? 'pick' : 'visited');

  const wearing = wearingOf(p.mukkaebi);
  const best = p.currentSeason?.best;
  const m = p.mukkaebi;
  const expPercent =
    m.nextLevelExp === null
      ? 100
      : Math.round(((m.exp - m.levelExp) / Math.max(1, m.nextLevelExp - m.levelExp)) * 100);

  const toggleBlock = async () => {
    setBusy(true);
    try {
      const { message } = p.isBlocked ? await unblockMember(p.userId) : await blockMember(p.userId);
      onBlocked(!p.isBlocked);
      toast(message.replace(/\.$/, ''));
      setMenuOpen(false);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'pick', label: 'PICK', count: p.counts.picks },
    { value: 'visited', label: '다녀온 가게', count: p.counts.visitedRestaurants },
    { value: 'reviews', label: '리뷰', count: p.counts.reviews },
  ];

  const showPickMap = tab === 'pick' && !p.isBlocked && p.picks.length > 0;
  return (
    <Screen
      footer={
        showPickMap && (
          <ButtonLink to={`/users/${p.userId}/picks`}>
            PICK {p.picks.length}곳 지도에서 보기
          </ButtonLink>
        )
      }
    >
      <AppHeader
        title="탐방러 프로필"
        right={
          p.isMe ? (
            <Link to="/me/profile" className={styles.headerLink}>
              프로필 수정
            </Link>
          ) : (
            <button
              type="button"
              className={styles.more}
              aria-label="신고·차단"
              onClick={() => setMenuOpen(true)}
            >
              •••
            </button>
          )
        }
      />
      <div className={styles.content}>
        <section className={styles.hero} aria-label={`${name}의 프로필`}>
          <MukkaebiFigure
            wearing={wearing}
            stage={m.stage}
            background={m.background?.sigunguName}
            height={240}
          />
          <p className={styles.worn}>
            {joinDot([`${m.stageName} 먹깨비`, ...Object.values(wearing).map((w) => w?.name)])}
          </p>
          <div className={styles.nameRow}>
            {p.profileImageUrl && <img src={p.profileImageUrl} alt="" className={styles.photo} />}
            <h2 className={styles.name}>{name}</h2>
            {(best?.tierTitle ?? p.title) && (
              <span className={styles.titleChip}>{best?.tierTitle ?? p.title}</span>
            )}
          </div>
          <p className={styles.meta}>
            {joinDot([
              p.homeRegion,
              `신뢰 온도 ${p.trustTemp.toFixed(1)}°`,
              best?.rank && p.currentSeason
                ? `시즌 ${p.currentSeason.seasonNo} ${best.sigunguName} ${best.rank}위`
                : null,
            ])}
          </p>
          {p.bio && <p className={styles.bio}>{p.bio}</p>}
          <div className={styles.level}>
            <span className={styles.levelBadge}>LV.{m.level}</span>
            <span className={styles.levelText}>
              <span className={styles.levelHead}>
                <span>경험치</span>
                {m.nextLevelExp !== null && (
                  <strong>
                    {m.exp.toLocaleString('ko-KR')} / {m.nextLevelExp.toLocaleString('ko-KR')}
                  </strong>
                )}
              </span>
              <span
                className={styles.bar}
                role="progressbar"
                aria-label="경험치"
                aria-valuenow={expPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${expPercent}%` }} />
              </span>
            </span>
          </div>
        </section>

        <dl className={styles.stats}>
          <div>
            <dt>{p.currentSeason ? `시즌 ${p.currentSeason.seasonNo} 정복` : '이번 시즌 정복'}</dt>
            <dd>{p.currentSeason?.conquestCount ?? 0}곳</dd>
          </div>
          <div>
            <dt>누적 정복</dt>
            <dd>{p.totalConquestCount}곳</dd>
          </div>
          <div>
            <dt>받은 도움돼요</dt>
            <dd>{p.helpfulReceived.toLocaleString('ko-KR')}</dd>
          </div>
        </dl>

        <section className={styles.card} aria-label="업적">
          <p className={styles.cardHead}>
            <strong>업적</strong>
            {p.isMe ? (
              <Link to="/me/seasons">전체 {p.achievements.totalCount}개 ›</Link>
            ) : (
              <span>
                {p.achievements.totalCount}개 중 {p.achievements.achievedCount}개
              </span>
            )}
          </p>
          {p.achievements.recent.length === 0 ? (
            <p className={styles.empty}>아직 달성한 업적이 없어요</p>
          ) : (
            <ul className={styles.achievements}>
              {p.achievements.recent.map((a) => (
                <li key={a.achievementId}>
                  <AchievementIcon iconKey={a.iconKey} />
                  <strong>{a.name}</strong>
                  <small>{formatKoreanDate(a.achievedAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        {p.isBlocked ? (
          <section className={styles.blocked}>
            <p>차단한 탐험가예요. 이 탐험가의 리뷰가 보이지 않아요.</p>
            <Button variant="white" size="sm" block={false} onClick={toggleBlock} disabled={busy}>
              차단 풀기
            </Button>
          </section>
        ) : (
          <>
            <div className={styles.tabs} role="tablist" aria-label="탐방러 기록">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={t.value === tab}
                  onClick={() => setParams({ tab: t.value }, { replace: true })}
                >
                  {t.label} {t.count}
                </button>
              ))}
            </div>
            {tab === 'pick' && <PickTab p={p} />}
            {tab === 'visited' && <VisitedTab p={p} />}
            {tab === 'reviews' && <ReviewsTab userId={p.userId} />}
          </>
        )}
      </div>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} label={name}>
        <p className={styles.sheetTitle}>{name}</p>
        <button
          type="button"
          className={styles.sheetRow}
          onClick={() => navigate(`/users/${p.userId}/report`, { state: { name } })}
        >
          <strong>신고하기</strong>
          <span>부적절한 리뷰나 닉네임을 알려 주세요</span>
        </button>
        <button
          type="button"
          className={styles.sheetRow}
          data-danger={!p.isBlocked}
          onClick={toggleBlock}
          disabled={busy}
        >
          <strong>{p.isBlocked ? '차단 풀기' : '차단하기'}</strong>
          <span>
            {p.isBlocked ? '이 탐험가의 리뷰가 다시 보여요' : '이 탐험가의 리뷰가 보이지 않아요'}
          </span>
        </button>
        <Button variant="gray" onClick={() => setMenuOpen(false)}>
          취소
        </Button>
      </BottomSheet>
    </Screen>
  );
}

/** PICK — 직접 방문 인증한 가게 중에서 고른 곳 (PROFILE-01 picks) */
function PickTab({ p }: { p: MemberProfile }) {
  if (p.picks.length === 0) {
    return <EmptyState title="아직 고른 PICK이 없어요" />;
  }
  return (
    <section aria-label="PICK">
      <p className={styles.listHead}>
        <strong>{p.nickname ?? '탐험가'}의 PICK</strong>
        <Link to={`/users/${p.userId}/picks`} className={styles.headerLink}>
          지도로 보기 ›
        </Link>
      </p>
      <p className={styles.verified}>✓ 모두 직접 방문 인증한 가게 중에서 고른 곳이에요</p>
      <ol className={styles.rows}>
        {p.picks.map((pick) => (
          <li key={pick.restaurantId}>
            <Link to={`/restaurants/${pick.restaurantId}`} className={styles.row}>
              <span className={styles.order}>{pick.order}</span>
              <span className={styles.rowText}>
                <span className={styles.rowName}>
                  {pick.name}
                  <small>방문 인증 {pick.visitCount}회</small>
                </span>
                <span className={styles.rowMeta}>
                  {joinDot([pick.categoryName, pick.dongName])}
                </span>
                {pick.comment && <span className={styles.comment}>“{pick.comment}”</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 다녀온 가게 — 시즌·구를 골라 본다, 처음엔 이번 시즌 전체 구 (PROFILE-02) */
function VisitedTab({ p }: { p: MemberProfile }) {
  const [seasonId, setSeasonId] = useState(p.currentSeason?.seasonId);
  const [sigunguId, setSigunguId] = useState<number>();
  const seasons = useAsync(getSeasons, []);
  const list = usePaged(
    (page) => getVisitedRestaurants(p.userId, { seasonId, sigunguId, page, size: 20 }),
    [p.userId, seasonId, sigunguId],
  );
  // 다시 불러오는 동안에도 구 고르기 칸이 비지 않게 마지막 목록을 둔다
  const [sigungus, setSigungus] = useState(list.first?.sigungus ?? []);
  if (list.first && list.first.sigungus !== sigungus) setSigungus(list.first.sigungus);
  const shownSeasonId = seasonId ?? list.first?.seasonId ?? undefined;

  let body;
  if (list.error !== undefined && list.items.length === 0) {
    body = <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />;
  } else if (list.loading && list.items.length === 0) {
    body = <Loading />;
  } else if (list.items.length === 0) {
    body = <EmptyState title="이 시즌에 정복한 가게가 없어요" />;
  } else {
    body = (
      <ul className={styles.rows}>
        {list.items.map((r) => (
          <li key={`${r.restaurantId}-${r.conqueredAt}`}>
            <Link
              to={r.reviewId ? `/reviews/${r.reviewId}` : `/restaurants/${r.restaurantId}`}
              className={styles.row}
            >
              <span className={styles.rowText}>
                <span className={styles.rowName}>
                  {r.name}
                  <small className={styles.conquered}>정복</small>
                </span>
                <span className={styles.rowMeta}>
                  {joinDot([r.categoryName, `${r.sigunguName} ${r.dongName}`])}
                </span>
              </span>
              <span className={styles.rowRight}>
                {r.overallScore !== null && (
                  <strong>
                    맛 <span className={styles.star}>★</span> {formatScore(r.overallScore)}
                  </strong>
                )}
                <small>{formatMonthDay(r.conqueredAt)} 방문</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="다녀온 가게">
      <div className={styles.listHead}>
        <span className={styles.pickers}>
          <select
            aria-label="시즌"
            className={styles.sort}
            value={shownSeasonId ?? ''}
            onChange={(e) => {
              setSeasonId(Number(e.target.value));
              setSigunguId(undefined);
            }}
          >
            {!seasons.data && p.currentSeason && (
              <option value={p.currentSeason.seasonId}>시즌 {p.currentSeason.seasonNo}</option>
            )}
            {seasons.data?.items.map((s) => (
              <option key={s.seasonId} value={s.seasonId}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="구"
            className={styles.sort}
            value={sigunguId ?? ''}
            onChange={(e) => setSigunguId(Number(e.target.value) || undefined)}
          >
            <option value="">전체 구</option>
            {sigungus.map((g) => (
              <option key={g.sigunguId} value={g.sigunguId}>
                {g.sigunguName} {g.conquestCount}곳
              </option>
            ))}
          </select>
        </span>
        <strong>{list.totalCount}곳</strong>
      </div>
      {body}
      {list.hasNext && (
        <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
          더 보기
        </Button>
      )}
    </section>
  );
}

/** 리뷰 — 최신순 / 도움돼요순 (REVIEW-10) */
function ReviewsTab({ userId }: { userId: number }) {
  const [sort, setSort] = useState<'LATEST' | 'HELPFUL'>('LATEST');
  const list = usePaged(
    (page) => getMemberReviews(userId, { sort, page, size: 10 }),
    [userId, sort],
  );
  return (
    <section aria-label="리뷰">
      <p className={styles.listHead}>
        <strong>리뷰 {list.totalCount}개</strong>
        <select
          aria-label="정렬"
          className={styles.sort}
          value={sort}
          onChange={(e) => setSort(e.target.value as 'LATEST' | 'HELPFUL')}
        >
          <option value="LATEST">최신순</option>
          <option value="HELPFUL">도움돼요순</option>
        </select>
      </p>
      {list.error !== undefined && list.items.length === 0 ? (
        <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
      ) : list.loading && list.items.length === 0 ? (
        <Loading />
      ) : list.items.length === 0 ? (
        <EmptyState title="아직 남긴 리뷰가 없어요" />
      ) : (
        <div className={styles.reviews}>
          {list.items.map((r) => (
            <ReviewCard
              key={r.reviewId}
              review={r}
              showRestaurant
              onChange={(next) => list.update((i) => i.reviewId === next.reviewId, next)}
            />
          ))}
        </div>
      )}
      {list.hasNext && (
        <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
          더 보기
        </Button>
      )}
    </section>
  );
}
