import { Link, useParams, useSearchParams } from 'react-router';
import { getSigunguRanking, TIER_NAME } from '../../api/ranking';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Screen } from '../../components/Screen';
import { SeasonSelect } from '../../components/SeasonSelect';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import styles from './Ranking.module.css';

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
                  <img src={p.profileImageUrl ?? mukkaebi} alt="" />
                  <span className={styles.podiumName}>{p.nickname}</span>
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
            <img src={me?.profileImageUrl ?? mukkaebi} alt="" width={36} height={36} />
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

        {data.topPicks.some((p) => p.pickCount > 0) && (
          <>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{data.sigunguName} TOP 3의 PICK</h2>
            </div>
            <p className={styles.note}>이 동네 고수들이 직접 다녀와서 고른 로컬 맛집</p>
            <ul className={styles.rows}>
              {data.topPicks
                .filter((p) => p.pickCount > 0)
                .map((p) => (
                  <li key={p.rank}>
                    <span className={styles.medal} data-rank={p.rank}>
                      {p.rank}
                    </span>
                    <span className={styles.rowName}>
                      {p.nickname}의 PICK
                      <br />
                      <span className={styles.rowSub}>
                        {p.restaurants.map((r) => r.name).join(' · ')}
                        {p.pickCount > p.restaurants.length &&
                          ` 외 ${p.pickCount - p.restaurants.length}곳`}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </>
        )}

        {data.items.length > 0 && (
          <>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>전체 순위</h2>
              <span>1위 ~ {data.items.length}위</span>
            </div>
            <ol className={styles.rows} aria-label="전체 순위">
              {data.items.map((r) => (
                <li key={r.rank} data-me={r.isMe}>
                  <span className={styles.rowRank}>{r.rank}</span>
                  <span className={styles.rowName}>
                    {r.nickname}
                    {r.isMe && ' (나)'}
                  </span>
                  <span className={styles.rowTier}>{r.tierName}</span>
                  <span className={styles.rowValue}>{r.conquestCount}곳</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Screen>
  );
}
