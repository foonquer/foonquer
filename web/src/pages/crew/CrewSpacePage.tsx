import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { getCrew, leaveCrew, type CrewSpace } from '../../api/crews';
import { AppHeader } from '../../components/AppHeader';
import { Dialog } from '../../components/Dialog';
import { MapView } from '../../components/MapView';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { crewQuestPeople, myIdOf } from '../../lib/crew';
import { formatMonthDay, formatScore } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { AwardIcon, GearIcon, SplitIcon, UtensilsIcon } from '../quest/QuestIcons';
import { Avatars } from './CrewParts';
import styles from './Crew.module.css';

/** 정복 목록은 처음에 이만큼만 (나머지는 "모두 보기") */
const PREVIEW = 2;

/** 이번 주 모임 퀘스트 한 줄 (G5): "함께 정복 · 화곡동 OO파스타" / "2명 이상 같이 가면 완료 · 각자 +100P" */
function questLines(q: CrewSpace['quests'][number]) {
  const done = q.status === 'DONE';
  if (q.type === 'TOGETHER') {
    return {
      title: q.restaurantName ? `${q.typeName} · ${q.restaurantName}` : q.typeName,
      sub: `${done ? '완료' : `${q.target}명 이상 같이 가면 완료`} · 각자 +${q.rewardPoint}P`,
    };
  }
  return { title: q.typeName, sub: `${q.progress}/${q.target} 완료 · 각자 +${q.rewardPoint}P` };
}

/** 모임 공간 /crews/:crewId (피그마 G5): 모임원 · 이번 주 모임 퀘스트 · 모임 지도 · 함께 정복한 곳 · 모임 배지 */
export function CrewSpacePage() {
  const crewId = Number(useParams().crewId);
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => getCrew(crewId), [crewId]);
  const [showAll, setShowAll] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    setBusy(true);
    try {
      await leaveCrew(crewId);
      toast('모임에서 나왔어요');
      navigate('/me/crews', { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
      setLeaving(false);
    }
  };

  if (error || !data) {
    return (
      <Screen>
        <AppHeader title="모임" />
        {error ? <EmptyState title={errorMessage(error)} onRetry={reload} /> : <Loading />}
      </Screen>
    );
  }

  const meId = myIdOf(data.members);
  const joined = data.members.filter((m) => m.status === 'JOINED');
  const conquests = showAll ? data.conquests : data.conquests.slice(0, PREVIEW);

  return (
    <Screen>
      <AppHeader
        title={data.name}
        right={
          <button
            type="button"
            className={styles.iconButton}
            aria-label="모임 나가기"
            onClick={() => setLeaving(true)}
          >
            <GearIcon />
          </button>
        }
      />
      <div className={styles.content}>
        <section className={styles.head} aria-label="모임원">
          <Avatars people={joined} meId={meId} size="lg" />
          <div className={styles.headBody}>
            <p className={styles.headTitle}>
              {data.memberCount}명
              <span className={styles.chip} data-tone="blue">
                {data.typeName}
              </span>
              <span className={styles.chip}>{data.sigunguName}</span>
            </p>
            <p className={styles.headSub}>
              함께 정복 {data.conquestCount}곳 · 모임 배지 {data.badges.length}개
            </p>
          </div>
          <Link to={`/crews/${crewId}/invite`} className={styles.headLink}>
            초대
          </Link>
        </section>

        <section className={styles.panel} aria-label="이번 주 모임 퀘스트">
          <p className={styles.panelHead}>이번 주 모임 퀘스트</p>
          {data.quests.length === 0 ? (
            <p className={styles.panelEmpty}>
              모임원이 2명 이상이면 모임 퀘스트를 받아요.{' '}
              <Link to={`/crews/${crewId}/invite`}>모임원 초대하기</Link>
            </p>
          ) : (
            <ul className={styles.questRows}>
              {data.quests.map((q) => {
                const { title, sub } = questLines(q);
                return (
                  <li key={q.crewQuestId} data-done={q.status === 'DONE'}>
                    <span className={styles.rowIcon}>
                      {q.type === 'TOGETHER' ? <UtensilsIcon size={18} /> : <SplitIcon size={18} />}
                    </span>
                    <span className={styles.rowBody}>
                      <strong>{title}</strong>
                      <small>{sub}</small>
                    </span>
                    <Avatars people={crewQuestPeople(q, data.members)} meId={meId} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="모임 지도">
          <p className={styles.sectionHead}>
            모임 지도<small>함께 정복한 곳만 보여요</small>
          </p>
          {data.conquests.length === 0 ? (
            <p className={styles.panelEmpty}>
              같은 가게에서 같은 날 2시간 안에 모임원과 인증하면 함께 정복으로 남아요.
            </p>
          ) : (
            <div className={styles.map}>
              <MapView
                fit
                pins={data.conquests.map((c) => ({
                  restaurantId: c.restaurantId,
                  name: c.name,
                  lat: c.lat,
                  lng: c.lng,
                  conquestState: 'CONQUERED' as const,
                }))}
                selectedId={null}
                onPinClick={(id) => navigate(`/restaurants/${id}`)}
              />
            </div>
          )}
        </section>

        {data.conquests.length > 0 && (
          <section className={styles.panel} aria-label="함께 정복한 곳">
            <ul className={styles.conquests}>
              {conquests.map((c) => (
                <li key={c.crewConquestId}>
                  <Link to={`/restaurants/${c.restaurantId}`}>
                    <span className={styles.rowBody}>
                      <strong>{c.name}</strong>
                      <small>
                        {formatMonthDay(c.date)} · {c.members.length}명 함께
                      </small>
                    </span>
                    <Avatars people={c.members} meId={meId} />
                    {c.tasteScore !== null && (
                      <span className={styles.score}>★ {formatScore(c.tasteScore)} 맛</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {data.conquests.length > PREVIEW && (
              <button type="button" className={styles.more} onClick={() => setShowAll((v) => !v)}>
                {showAll ? '접기' : `${data.conquests.length}곳 모두 보기 ›`}
              </button>
            )}
          </section>
        )}

        <section className={styles.badgeCard} aria-label="모임 배지">
          <span className={styles.badgeIcon}>
            <AwardIcon size={22} />
          </span>
          <div>
            <p className={styles.badgeTitle}>
              {data.badges.length > 0
                ? `모임 배지 · ${data.badges.map((b) => b.name).join(' · ')}`
                : '모임 배지 · 아직 없어요'}
            </p>
            {data.nextBadge && (
              <p className={styles.badgeText}>
                함께 정복 {data.nextBadge.target}곳이면 "{data.nextBadge.name}" 배지를 받아요 (
                {Math.min(data.conquestCount, data.nextBadge.target)}/{data.nextBadge.target})
              </p>
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={leaving}
        title="모임에서 나갈까요?"
        description={['함께 정복한 기록은 모임에 남아요. 다시 들어오려면 초대를 받아야 해요.']}
        confirmLabel="나가기"
        onCancel={() => setLeaving(false)}
        onConfirm={() => void leave()}
        busy={busy}
      />
    </Screen>
  );
}
