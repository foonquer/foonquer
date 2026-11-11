import { Link } from 'react-router';
import type { Quest } from '../../api/quests';
import { dDay, questPlaceLine } from '../../lib/quest';
import { LevelIcon } from './QuestIcons';
import styles from './Quest.module.css';

/**
 * 퀘스트 카드 (피그마 Q2): 난이도 동그라미 · 난이도 칩 + 종류 · 제목 · 가게 줄 · 이유 한 줄 · 보상과 남은 날.
 * 두 곳 이상 정복하는 퀘스트는 진행 막대
 */
export function QuestCard({
  quest,
  daysLeft,
  to,
}: {
  quest: Quest;
  daysLeft: number | null;
  to?: string;
}) {
  const done = quest.status === 'DONE';
  const place = questPlaceLine(quest);
  const body = (
    <>
      <span className={styles.levelCircle} data-level={quest.level} data-done={done}>
        <LevelIcon level={quest.level} done={done} />
      </span>
      <div className={styles.cardBody}>
        <p className={styles.cardKind}>
          <span className={styles.levelChip} data-level={quest.level}>
            {quest.isBonus ? '보너스' : quest.levelName}
          </span>
          {quest.typeName}
        </p>
        <p className={styles.cardTitle}>{quest.title}</p>
        {place && <p className={styles.cardPlace}>{place}</p>}
        <p className={styles.cardSummary}>{quest.summary}</p>
        {quest.target > 1 && (
          <p className={styles.cardProgress}>
            <span
              role="progressbar"
              aria-label="진행"
              aria-valuemin={0}
              aria-valuemax={quest.target}
              aria-valuenow={quest.progress}
            >
              <span style={{ width: `${(quest.progress / quest.target) * 100}%` }} />
            </span>
            {quest.progress}/{quest.target}
          </p>
        )}
      </div>
      <div className={styles.cardSide}>
        <strong data-done={done}>+{quest.rewardPoint}P</strong>
        <span data-done={done}>{done ? '완료' : daysLeft !== null ? dDay(daysLeft) : ''}</span>
      </div>
    </>
  );
  return to ? (
    <Link to={to} className={styles.card} data-done={done}>
      {body}
    </Link>
  ) : (
    <div className={styles.card} data-done={done}>
      {body}
    </div>
  );
}
