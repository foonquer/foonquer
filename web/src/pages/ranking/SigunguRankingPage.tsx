import { Link, useParams, useSearchParams } from 'react-router';
import { getSigunguRanking, TIER_NAME } from '../../api/ranking';
import { AppHeader } from '../../components/AppHeader';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { Screen } from '../../components/Screen';
import { SeasonSelect } from '../../components/SeasonSelect';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import styles from './Ranking.module.css';

type Row = { profileImageUrl: string | null; mukkaebi: { hatCode: string | null } };

/** 순위·PICK 줄의 얼굴: 프로필 사진이 있으면 사진, 없으면 쓴 모자까지 그린 먹깨비 (피그마 구 랭킹) */
function RankAvatar({ row, size, ring }: { row: Row | undefined; size: number; ring?: number }) {
  return (
    <span className={styles.avatarBox} data-ring={ring} style={{ width: size, height: size }}>
      {row?.profileImageUrl ? (
        <img src={row.profileImageUrl} alt="" />
      ) : (
        <MukkaebiAvatar
          size={size}
          wearing={
            row?.mukkaebi.hatCode ? { HAT: { code: row.mukkaebi.hatCode, name: '' } } : undefined
          }
        />
      )}
    </span>
  );
}

/** 구 랭킹 TOP 50 /ranking/sigungus/:sigunguId?seasonId= (RANK-05) */
export function SigunguRankingPage() {
  const sigunguId = Number(useParams().sigunguId);
  const [params, setParams] = useSearchParams();
  const seasonId = Number(params.get('seasonId')) || undefined;
  const { data, error, reload } = useAsync(
    () => getSigunguRanking(sigunguId, seasonId),
    [sigunguId, seasonId],
  );

  if (error) {
    return (
      <Screen>
        <AppHeader title="구 랭킹" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="구 랭킹" />
        <Loading />
      </Screen>
    );
  }

  // 2위 · 1위 · 3위 순서로 놓는다 (응답 순서에 기대지 않고 rank로 찾는다)
  const podium = [2, 1, 3].flatMap((rank) => data.items.filter((i) => i.rank === rank));
  const me = data.items.find((i) => i.isMe);
  const picks = data.topPicks.filter((p) => p.pickCount > 0);
  // PICK 줄의 먹깨비는 같은 사람의 순위 줄에서 가져온다 (TOP 3는 순위 목록에도 있다)
  const rowOf = (userId: number | null) => data.items.find((i) => i.userId === userId);
  return (
    <Screen>
      <AppHeader
        title={`${data.sigunguName} 랭킹`}
        right={
          <SeasonSelect
            season={data.season}
            onChange={(id) => setParams({ seasonId: String(id) }, { replace: true })}
          />
        }
      />
      <div className={styles.content}>
        <p className={styles.sub}>
          {data.season.name} 정복 수 기준 · 활동 탐험가 {data.activeExplorerCount}명 · TOP 50 ·{' '}
          <Link to={`/ranking?tab=rank${seasonId ? `&seasonId=${seasonId}` : ''}`}>
            지도로 보기 ›
          </Link>
        </p>

        {podium.length > 0 ? (
          <section className={styles.fame} aria-label={`${data.sigunguName} 먹짱 TOP 3`}>
            <p className={styles.fameLabel}>SEASON {data.season.seasonNo} · HALL OF FAME</p>
            <h2 className={styles.fameTitle}>{data.sigunguName} 먹짱 TOP 3</h2>
            <ol className={styles.podium}>
              {podium.map((p) => (
                <li key={p.rank} className={styles.podiumItem} data-rank={p.rank}>
                  <span className={styles.podiumFace}>
                    <RankAvatar row={p} size={p.rank === 1 ? 60 : 46} />
                  </span>
                  <span className={styles.podiumName}>
                    {p.userId !== null ? (
                      <Link to={`/users/${p.userId}`} className={styles.profileLink}>
                        {p.nickname}
                      </Link>
                    ) : (
                      p.nickname
                    )}
                  </span>
                  <span className={styles.podiumMeta}>
                    {p.rank}위 · {p.rank === 1 ? '먹짱 ' : ''}
                    {p.conquestCount}곳{p.rank === 1 ? '' : ' 정복'}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <EmptyState
            title="아직 이 구를 정복한 사람이 없어요"
            description="첫 정복으로 먹짱에 도전해 보세요."
          />
        )}

        {data.myRank && (
          <section className={styles.mine} aria-label="내 순위">
            <span className={styles.mineRank}>{data.myRank.rank}</span>
            <RankAvatar row={me} size={36} />
            <span className={styles.mineText}>
              <span className={styles.mineTitle}>
                내 순위{me?.nickname ? ` · ${me.nickname}` : ''}
              </span>
              <span className={styles.mineSub}>
                {TIER_NAME[data.myRank.tier]} ·{' '}
                {data.myRank.mukjjangGap > 0
                  ? `먹짱까지 ${data.myRank.mukjjangGap}곳 남았어요`
                  : '지금 먹짱이에요!'}
              </span>
            </span>
            <span className={styles.mineCount}>{data.myRank.conquestCount}곳</span>
          </section>
        )}

        {picks.length > 0 && (
          <section className={styles.pickCard} aria-label={`${data.sigunguName} TOP 3의 PICK`}>
            <h2 className={styles.sectionTitle}>{data.sigunguName} TOP 3의 PICK</h2>
            <p className={styles.pickNote}>이 동네 고수들이 직접 다녀와서 고른 로컬 맛집</p>
            <ul className={styles.pickList}>
              {picks.map((p) => {
                const body = (
                  <>
                    <span className={styles.medal} data-rank={p.rank}>
                      {p.rank}
                    </span>
                    <RankAvatar row={rowOf(p.userId)} size={40} ring={p.rank} />
                    <span className={styles.pickText}>
                      <strong>{p.nickname}의 PICK</strong>
                      <small>
                        {p.restaurants.map((r) => r.name).join(' · ')}
                        {p.pickCount > p.restaurants.length &&
                          ` 외 ${p.pickCount - p.restaurants.length}곳`}
                      </small>
                    </span>
                    {p.userId !== null && (
                      <span className={styles.chevron} aria-hidden="true">
                        ›
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={p.rank}>
                    {p.userId !== null ? (
                      <Link to={`/users/${p.userId}?tab=pick`} className={styles.pickRow}>
                        {body}
                      </Link>
                    ) : (
                      <div className={styles.pickRow}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {data.items.length > 0 && (
          <>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>전체 순위</h2>
              <span>1위 ~ {data.items.length}위</span>
            </div>
            <ol className={styles.rankList} aria-label="전체 순위">
              {data.items.map((r) => {
                const body = (
                  <>
                    <span className={styles.rankNo} data-rank={r.rank}>
                      {r.rank}
                    </span>
                    <RankAvatar row={r} size={34} />
                    <span className={styles.rankName}>
                      <strong>{r.nickname}</strong>
                      {r.isMe && <span className={styles.meChip}>나</span>}
                      <span className={styles.rowTier}>{r.tierName}</span>
                    </span>
                    <span className={styles.rankCount}>{r.conquestCount}곳</span>
                  </>
                );
                return (
                  <li key={r.rank} data-me={r.isMe}>
                    {r.userId !== null ? (
                      <Link to={`/users/${r.userId}`} className={styles.rankRow}>
                        {body}
                      </Link>
                    ) : (
                      <div className={styles.rankRow}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </Screen>
  );
}
