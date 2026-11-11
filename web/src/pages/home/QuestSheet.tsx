import { useState } from 'react';
import { Link } from 'react-router';
import { getCrewQuests } from '../../api/crews';
import type { CurrentQuests } from '../../api/quests';
import { BottomSheet } from '../../components/BottomSheet';
import { ButtonLink } from '../../components/Button';
import { errorMessage } from '../../lib/api';
import { dDay, hasNewQuests } from '../../lib/quest';
import { useAsync } from '../../lib/useAsync';
import { CrewQuestCard, CrewTypeIcon } from '../crew/CrewParts';
import crew from '../crew/Crew.module.css';
import { QuestCard } from '../quest/QuestCard';
import { FlagIcon, GiftIcon } from '../quest/QuestIcons';
import quest from '../quest/Quest.module.css';
import styles from './HomePage.module.css';

/** 홈 지도의 퀘스트 아이콘 (피그마 Q1): 진행 링 + "1/3" + 새 퀘스트 점 */
export function QuestButton({ data, onClick }: { data: CurrentQuests; onClick: () => void }) {
  const week = data.week;
  if (!data.enabled || !week || week.baseCount === 0) return null;
  const ratio = week.doneCount / week.baseCount;
  const r = 25;
  const length = 2 * Math.PI * r;
  return (
    <button
      type="button"
      className={styles.quest}
      onClick={onClick}
      aria-label={`이번 주 퀘스트 ${week.doneCount}/${week.baseCount}`}
    >
      <span className={styles.questRing}>
        <svg viewBox="0 0 56 56" className={styles.questRingSvg} aria-hidden="true">
          <circle cx="28" cy="28" r={r} className={styles.questTrack} />
          <circle
            cx="28"
            cy="28"
            r={r}
            className={styles.questBar}
            strokeDasharray={`${length * ratio} ${length}`}
          />
        </svg>
        <FlagIcon size={22} />
        {hasNewQuests(data) && <span className={styles.questDot} aria-hidden="true" />}
      </span>
      <span className={styles.questCount} aria-hidden="true">
        {week.doneCount}/{week.baseCount}
      </span>
    </button>
  );
}

/** 퀘스트 시트의 모임 퀘스트 탭 (피그마 G1): 모임 고르기 · 모임 퀘스트 · 모임 공간 열기 / 새 모임 만들기 */
function CrewQuestTab({ data }: { data: Awaited<ReturnType<typeof getCrewQuests>> }) {
  const [crewId, setCrewId] = useState<number | null>(null);
  const picked = data.items.find((c) => c.crewId === crewId) ?? data.items[0];
  if (!picked) {
    return (
      <>
        <p className={quest.empty}>친구·가족·연인과 모임을 만들면 같이 정복하는 퀘스트를 받아요.</p>
        <div className={crew.sheetActions}>
          <ButtonLink to="/crews/join" variant="white" size="md">
            초대 코드로 참여
          </ButtonLink>
          <ButtonLink to="/crews/new" size="md">
            새 모임 만들기
          </ButtonLink>
        </div>
      </>
    );
  }
  return (
    <>
      {data.items.length > 1 && (
        <div className={crew.crewChips} aria-label="모임 고르기">
          {data.items.map((c) => (
            <button
              key={c.crewId}
              type="button"
              aria-pressed={c.crewId === picked.crewId}
              onClick={() => setCrewId(c.crewId)}
            >
              <CrewTypeIcon type={c.type} size={16} />
              {c.name} {c.memberCount}
            </button>
          ))}
        </div>
      )}
      {picked.quests.length === 0 ? (
        <p className={quest.empty}>
          모임원이 2명 이상이면 모임 퀘스트를 받아요.
          <br />
          <Link to={`/crews/${picked.crewId}/invite`}>모임원 초대하기</Link>
        </p>
      ) : (
        <div className={crew.questList}>
          {picked.quests.map((q) => (
            <CrewQuestCard key={q.crewQuestId} quest={q} members={picked.members} />
          ))}
        </div>
      )}
      <div className={crew.sheetActions}>
        <ButtonLink to={`/crews/${picked.crewId}`} variant="white" size="md">
          모임 공간 열기
        </ButtonLink>
        <ButtonLink to="/crews/new" size="md">
          새 모임 만들기
        </ButtonLink>
      </div>
    </>
  );
}

/** 이번 주 퀘스트 시트 (피그마 Q2, 모임 퀘스트 탭은 G1) */
export function QuestSheet({
  data,
  open,
  onClose,
}: {
  data: CurrentQuests;
  open: boolean;
  onClose: () => void;
}) {
  const week = data.week;
  const [tab, setTab] = useState<'mine' | 'crew'>('mine');
  // 시트를 열 때마다 모임 퀘스트를 새로 받는다 (탭 이름의 수에도 쓴다)
  const crews = useAsync(() => (open ? getCrewQuests() : Promise.resolve(null)), [open]);
  const crewActive = (crews.data?.items ?? []).reduce(
    (sum, c) => sum + c.quests.filter((q) => q.status === 'ACTIVE').length,
    0,
  );
  return (
    <BottomSheet open={open} onClose={onClose} label="이번 주 퀘스트" dim="light">
      <div className={quest.sheetHead}>
        <div>
          <h2 className={quest.sheetTitle}>이번 주 퀘스트</h2>
          <p className={quest.sheetSub}>
            {week ? `${dDay(week.daysLeft)} · 월요일마다 새로 받아요` : '월요일마다 새로 받아요'}
          </p>
        </div>
        {week && week.baseCount > 0 && (
          <span className={quest.activity}>
            {week.activityName} · {week.baseCount}개
          </span>
        )}
      </div>

      <div className={crew.tabs} role="tablist" aria-label="퀘스트 종류">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          onClick={() => setTab('mine')}
        >
          내 퀘스트{week && week.baseCount > 0 ? ` ${week.doneCount}/${week.baseCount}` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'crew'}
          onClick={() => setTab('crew')}
        >
          모임 퀘스트{crewActive > 0 ? ` · ${crewActive}` : ''}
        </button>
      </div>

      {tab === 'crew' ? (
        crews.error ? (
          <p className={quest.empty}>{errorMessage(crews.error)}</p>
        ) : crews.data ? (
          <CrewQuestTab data={crews.data} />
        ) : (
          <p className={quest.empty}>불러오는 중…</p>
        )
      ) : !week ? (
        <p className={quest.empty}>
          내 동네를 정하면 그 구 안에서 퀘스트를 받아요.
          <br />
          <Link to="/me/regions">내 동네 정하기</Link>
        </p>
      ) : data.quests.length === 0 ? (
        <p className={quest.empty}>이번 주에 추천할 곳이 아직 없어요. 다음 주에 다시 볼게요.</p>
      ) : (
        <>
          <div className={quest.list}>
            {data.quests.map((q) => (
              <QuestCard
                key={q.questId}
                quest={q}
                daysLeft={week.daysLeft}
                to={`/quests/${q.questId}`}
              />
            ))}
          </div>
          <section className={quest.box} aria-label="주간 아이템 상자">
            <span className={quest.boxIcon}>
              {week.boxReceived ? <FlagIcon size={20} /> : <GiftIcon size={20} />}
            </span>
            <div className={quest.boxBody}>
              <p className={quest.boxTitle}>
                {week.boxReceived
                  ? '이번 주 주간 아이템 상자를 받았어요'
                  : `${week.baseCount}개 모두 깨면 주간 아이템 상자`}
              </p>
              <span className={quest.boxBar} aria-hidden="true">
                <span style={{ width: `${(week.doneCount / week.baseCount) * 100}%` }} />
              </span>
              <p className={quest.boxText}>
                {week.boxReceived
                  ? '보너스 퀘스트를 깨면 하나씩 더 열려요'
                  : `${week.doneCount}/${week.baseCount} 완료 · 다 깨면 보너스 퀘스트가 열려요`}
              </p>
            </div>
          </section>
        </>
      )}
    </BottomSheet>
  );
}
