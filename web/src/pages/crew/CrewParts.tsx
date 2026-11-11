import { Link } from 'react-router';
import type { CrewMember, CrewQuest, CrewType } from '../../api/crews';
import {
  avatarColor,
  avatarLetter,
  crewQuestPeople,
  crewQuestStatus,
  ME_COLOR,
  meLast,
} from '../../lib/crew';
import {
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  HomeIcon,
  SplitIcon,
  UsersIcon,
  UtensilsIcon,
} from '../quest/QuestIcons';
import styles from './Crew.module.css';

type Person = { userId: number; nickname: string | null };

/** 모임원 동그라미 (겹쳐 놓는다). 나는 회색 "나" */
export function Avatars({
  people,
  meId,
  size = 'sm',
}: {
  people: Person[];
  meId: number | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={styles.avatars} data-size={size}>
      {meLast(people, meId).map((p) => (
        <span
          key={p.userId}
          className={styles.avatar}
          style={{ background: p.userId === meId ? ME_COLOR : avatarColor(p.userId) }}
          title={p.userId === meId ? '나' : (p.nickname ?? undefined)}
        >
          {avatarLetter(p, meId)}
        </span>
      ))}
    </span>
  );
}

/** 모임 종류 그림: 친구 사람들 / 가족 집 / 연인 하트 */
export function CrewTypeIcon({ type, size }: { type: CrewType; size?: number }) {
  if (type === 'FAMILY') return <HomeIcon size={size} />;
  if (type === 'COUPLE') return <HeartIcon size={size} />;
  return <UsersIcon size={size} />;
}

/** 모임 퀘스트 카드 (피그마 G1): 그림 · "같이" + 종류 · 제목 · 가게 줄 · 모임원과 진행 · 각자 받는 포인트 */
export function CrewQuestCard({ quest, members }: { quest: CrewQuest; members: CrewMember[] }) {
  const done = quest.status === 'DONE';
  const meId = members.find((m) => m.isMe)?.userId;
  const body = (
    <>
      <span className={styles.questCircle} data-done={done}>
        {quest.type === 'TOGETHER' ? <UtensilsIcon /> : <SplitIcon />}
      </span>
      <div className={styles.questBody}>
        <p className={styles.questKind}>
          <span className={styles.togetherChip}>같이</span>
          {quest.typeName}
        </p>
        <p className={styles.questTitle}>{quest.title}</p>
        <p className={styles.questSummary}>{quest.summary}</p>
        <p className={styles.questStatus}>
          <Avatars people={crewQuestPeople(quest, members)} meId={meId} />
          {crewQuestStatus(quest, members)}
        </p>
      </div>
      <div className={styles.questSide}>
        <strong data-done={done}>+{quest.rewardPoint}P</strong>
        <span data-done={done}>{done ? '완료' : '각자'}</span>
      </div>
    </>
  );
  return quest.restaurantId && !done ? (
    <Link to={`/restaurants/${quest.restaurantId}`} className={styles.questCard}>
      {body}
    </Link>
  ) : (
    <div className={styles.questCard} data-done={done}>
      {body}
    </div>
  );
}

/** 모임원에게 보이는 것과 안 보이는 것 (G3·G4) */
export function PrivacyRows() {
  return (
    <ul className={styles.privacy}>
      <li>
        <EyeIcon />
        보여요 · 정복한 가게, 맛 별점, 모임 퀘스트 진행
      </li>
      <li data-off="true">
        <EyeOffIcon />안 보여요 · 방문 시간, 지금 위치, 다른 모임 활동
      </li>
    </ul>
  );
}
