import { useState } from 'react';
import {
  getAchievements,
  getSeasonRecords,
  getTitles,
  type OwnedTitle,
  setRepresentativeTitle,
} from '../../api/ranking';
import { AppHeader } from '../../components/AppHeader';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDate, formatSeasonRange } from '../../lib/format';
import { euro } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import styles from './MyRecords.module.css';

async function loadSeasons() {
  const [records, titles, achievements] = await Promise.all([
    getSeasonRecords(),
    getTitles(),
    getAchievements(),
  ]);
  return { records, titles, achievements };
}

/** 시즌 기록 · 칭호 /me/seasons (RANK-08·09·10·11) */
export function SeasonsPage() {
  const toast = useToast();
  const { data, error, reload } = useAsync(loadSeasons, []);
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <Screen>
        <AppHeader title="시즌 기록 · 칭호" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="시즌 기록 · 칭호" />
        <Loading />
      </Screen>
    );
  }

  const { records, titles, achievements } = data;
  const current = records.current;
  const best = current?.best;
  const choose = async (title: OwnedTitle | null) => {
    setBusy(true);
    try {
      const result = await setRepresentativeTitle(
        title ? { type: title.type, refId: title.refId } : null,
      );
      toast(
        result.isAuto || !result.representativeTitle
          ? '대표 칭호를 자동으로 보여 줘요'
          : `대표 칭호를 ${euro(result.representativeTitle)} 바꿨어요`,
      );
      reload();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="시즌 기록 · 칭호" />
      <div className={styles.content}>
        {current && (
          <section className={styles.current} aria-label="이번 시즌">
            <p className={styles.currentHead}>
              <span>{current.season.name} · 진행 중</span>
              <span>
                {formatSeasonRange(current.season)} · D-{current.season.daysLeft}
              </span>
            </p>
            <p className={styles.currentTitle}>
              {best?.tierTitle ?? '아직 정복 전이에요'}
              {best?.rank && <span className={styles.rankBadge}>{best.rank}위</span>}
            </p>
            {best && (
              <span className={styles.gold} aria-hidden="true">
                <span
                  style={{
                    width: `${best.nextTier ? (current.conquestCount / (current.conquestCount + best.nextTier.remaining)) * 100 : 100}%`,
                  }}
                />
              </span>
            )}
            <p className={styles.currentSub}>
              {current.conquestCount}곳 정복
              {best?.nextTier && ` · ${best.nextTier.tierName}까지 ${best.nextTier.remaining}곳`}
            </p>
          </section>
        )}

        <h2 className={styles.sectionTitle}>지난 시즌</h2>
        {records.records.length === 0 ? (
          <p className={styles.note}>시즌이 끝나면 여기에 기록이 남아요.</p>
        ) : (
          <ul className={styles.card}>
            {records.records.map((r) => (
              <li key={r.season.seasonId} className={styles.seasonRow}>
                <span>
                  <strong>{r.season.name}</strong>
                  <br />
                  <span className={styles.rowMeta}>{formatSeasonRange(r.season)}</span>
                </span>
                <span className={styles.seasonRight}>
                  <span className={styles.tierChip}>{r.tierTitle}</span>
                  <span className={styles.rowMeta}>
                    {r.rank ? `${r.rank}위 · ` : ''}
                    {r.conquestTotal}곳{r.rewardClubItem && ` · ${r.rewardClubItem.name}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className={styles.sectionTitle}>
          획득한 칭호 <span className={styles.count}>{titles.totalCount}</span>
        </h2>
        <p className={styles.note} style={{ textAlign: 'left' }}>
          누르면 대표 칭호로 보여 줘요 · 지금: {titles.representativeTitle ?? '없음'}
          {titles.isAuto && ' (자동)'}
        </p>
        <div className={styles.titles}>
          <button
            type="button"
            className={styles.title}
            aria-pressed={titles.isAuto}
            disabled={busy}
            onClick={() => choose(null)}
          >
            <span aria-hidden="true">✦</span>
            자동
            <small>이번 시즌 최고 티어</small>
          </button>
          {titles.items.map((t) => (
            <button
              key={`${t.type}-${t.refId}`}
              type="button"
              className={styles.title}
              aria-pressed={t.isRepresentative}
              disabled={busy}
              onClick={() => choose(t)}
            >
              <span aria-hidden="true">★</span>
              {t.title}
              <small>{t.seasonNo ? `S${t.seasonNo}` : '업적'}</small>
            </button>
          ))}
        </div>

        <h2 className={styles.sectionTitle}>
          업적{' '}
          <span className={styles.count}>
            {achievements.achievedCount} / {achievements.totalCount}
          </span>
        </h2>
        <ul className={styles.card}>
          {achievements.items.map((a) => (
            <li key={a.achievementId} className={styles.achievement} data-done={a.achieved}>
              <span className={styles.achievementText}>
                <strong>{a.name}</strong>
                <span className={styles.rowMeta}>{a.description}</span>
              </span>
              <span className={styles.achievementRight}>
                {a.achieved ? (
                  formatDate(a.achievedAt)
                ) : (
                  <>
                    {a.progress.current} / {a.progress.target}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}
