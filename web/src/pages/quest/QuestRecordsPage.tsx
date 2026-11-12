import { useParams } from 'react-router';
import { getQuestRecords, getQuestWeek, type QuestRecords, type QuestWeek } from '../../api/quests';
import { AppHeader } from '../../components/AppHeader';
import { MenuList } from '../../components/MenuList';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatPoint } from '../../lib/format';
import { eulReul, gwaWa } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import { QuestCard } from './QuestCard';
import { AwardIcon, CheckIcon, CloseIcon, CompassIcon, FlagIcon } from './QuestIcons';
import styles from './Quest.module.css';

/** "2026-11-10" → "11.10" */
const md = (date: string) => {
  const [, m, d] = date.split('-');
  return `${Number(m)}.${Number(d)}`;
};

/** 지난 주 한 줄 설명: "3/3 완료 · 주간 상자 받음", "1/2 · 상자 못 받음" */
function weekText(w: QuestWeek) {
  if (w.isCurrent) return `${w.doneCount}/${w.baseCount} 진행 중`;
  if (!w.boxReceived) return `${w.doneCount}/${w.baseCount} · 상자 못 받음`;
  return w.bonusDoneCount > 0
    ? `${w.doneCount}/${w.baseCount} 완료 + 보너스 ${w.bonusDoneCount}개`
    : `${w.doneCount}/${w.baseCount} 완료 · 주간 상자 받음`;
}

/** 연속 기록 문구 (보상 아이템이 있으면 같이: 칭호 "꾸준한 탐험가"와 탐험가 배낭) */
function streakHint(r: QuestRecords) {
  const goal = r.streakGoal;
  if (!goal) return null;
  const title = `칭호 "${goal.name}"`;
  // 따옴표 안 이름의 받침으로 조사를 고른다
  const prize = goal.rewardItem
    ? `${title}${gwaWa(goal.name).slice(-1)} ${goal.rewardItem.name}`
    : title;
  if (goal.achieved)
    return `${prize}${eulReul(goal.rewardItem?.name ?? goal.name).slice(-1)} 받았어요`;
  const left = goal.target - r.streak;
  if (left <= 1 && !r.thisWeekDone) return `이번 주까지 깨면 ${prize}`;
  return `${goal.target}주 연속으로 깨면 ${prize}`;
}

/** 내 정보 → 퀘스트 기록 /me/quests (피그마 M2, QUEST-05) */
export function QuestRecordsPage() {
  const { data, error, reload } = useAsync(getQuestRecords, []);
  return (
    <Screen>
      <AppHeader title="퀘스트 기록" />
      {error ? (
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={styles.content}>
          <section className={styles.streakCard} aria-label="연속 완료">
            <div className={styles.streakTop}>
              <div>
                <p className={styles.streakTitle}>
                  {data.streak > 0 ? `${data.streak}주 연속 완료 중` : '이번 주 퀘스트를 깨 보세요'}
                </p>
                {streakHint(data) && <p className={styles.streakSub}>{streakHint(data)}</p>}
              </div>
              <span className={styles.medal}>
                <AwardIcon />
              </span>
            </div>
            <div className={styles.stats}>
              <div>
                <strong>{data.completedCount}개</strong>
                <span>퀘스트 완료</span>
              </div>
              <div>
                <strong>{data.placeCount}곳</strong>
                <span>퀘스트로 간 곳</span>
              </div>
              <div>
                <strong>{formatPoint(data.pointTotal)}</strong>
                <span>받은 포인트</span>
              </div>
            </div>
            {data.placesGoal && !data.placesGoal.achieved && (
              <p className={styles.goal}>
                <CompassIcon size={16} />
                업적 "{data.placesGoal.name}"까지 퀘스트로{' '}
                {Math.max(data.placesGoal.target - data.placeCount, 1)}곳 더
              </p>
            )}
          </section>

          <h2 className={styles.sectionTitle}>지난 퀘스트</h2>
          {data.weeks.length === 0 ? (
            <p className={styles.empty}>
              홈 지도의 깃발 아이콘을 눌러 이번 주 퀘스트를 받아 보세요.
            </p>
          ) : (
            <MenuList
              label="지난 퀘스트"
              items={data.weeks.map((w) => ({
                label: (
                  <span className={styles.weekLabel}>
                    <span
                      className={styles.weekIcon}
                      data-state={w.isCurrent ? 'current' : w.boxReceived ? 'done' : 'missed'}
                    >
                      {w.isCurrent ? (
                        <FlagIcon size={15} />
                      ) : w.boxReceived ? (
                        <CheckIcon size={15} />
                      ) : (
                        <CloseIcon size={15} />
                      )}
                    </span>
                    <span>
                      {w.isCurrent ? '이번 주 · ' : ''}
                      {md(w.startDate)} ~ {md(w.endDate)}
                      <small>{weekText(w)}</small>
                    </span>
                  </span>
                ),
                to: `/me/quests/${w.weekId}`,
              }))}
            />
          )}
        </div>
      )}
    </Screen>
  );
}

/** 한 주의 퀘스트 /me/quests/:weekId (QUEST-06) */
export function QuestWeekPage() {
  const weekId = Number(useParams().weekId);
  const { data, error, reload } = useAsync(() => getQuestWeek(weekId), [weekId]);
  const title = data ? `${md(data.week.startDate)} ~ ${md(data.week.endDate)} 퀘스트` : '퀘스트';
  return (
    <Screen>
      <AppHeader title={title} />
      {error ? (
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={styles.content}>
          <p className={styles.sheetSub}>{weekText(data.week)}</p>
          <div className={styles.list}>
            {data.quests.map((q) => (
              <QuestCard
                key={q.questId}
                quest={q}
                daysLeft={data.week.isCurrent ? data.week.daysLeft : null}
                to={data.week.isCurrent ? `/quests/${q.questId}` : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
}
