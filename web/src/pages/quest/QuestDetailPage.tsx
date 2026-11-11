import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { dismissQuest, getQuest, type QuestDetail, swapQuest } from '../../api/quests';
import mealThumb from '../../assets/illust/meal-thumb.svg';
import { AppHeader } from '../../components/AppHeader';
import { ButtonLink } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDistance, formatScore, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { dDay } from '../../lib/quest';
import { CheckIcon, GiftIcon, RefreshIcon, SparkleIcon } from './QuestIcons';
import styles from './Quest.module.css';

/** 상세 제목: "…새 국밥집" → "…새 국밥집 정복하기", "…정복" → "…정복하기" */
function detailTitle(q: QuestDetail) {
  if (q.title.endsWith('정복')) return `${q.title}하기`;
  if (q.type === 'NEW_TASTE') return `${q.title} 정복하기`;
  return q.title;
}

const REASON_ICONS = [RefreshIcon, SparkleIcon, CheckIcon];

/** 퀘스트 상세 /quests/:questId (피그마 Q3, QUEST-02~04) */
export function QuestDetailPage() {
  const questId = Number(useParams().questId);
  const { data, error, reload } = useAsync(() => getQuest(questId), [questId]);
  if (error) {
    return (
      <Screen>
        <AppHeader title="퀘스트" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="퀘스트" />
        <Loading />
      </Screen>
    );
  }
  return <Detail quest={data} />;
}

function Detail({ quest }: { quest: QuestDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const done = quest.status === 'DONE';
  const r = quest.restaurant;

  const change = async (mode: 'swap' | 'dismiss') => {
    setBusy(true);
    try {
      const next = await (mode === 'swap' ? swapQuest : dismissQuest)(quest.questId);
      toast({
        message: mode === 'swap' ? '다른 퀘스트로 바꿨어요' : '이 종류는 덜 추천할게요',
        check: true,
      });
      navigate(`/quests/${next.questId}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reward =
    quest.boxRemaining === null
      ? `완료하면 +${quest.rewardPoint}P`
      : quest.boxRemaining > 0
        ? `완료하면 +${quest.rewardPoint}P · 주간 상자까지 ${quest.boxRemaining}개 남아요`
        : `완료하면 +${quest.rewardPoint}P · 주간 상자를 받아요`;

  return (
    <Screen
      footer={
        done ? undefined : (
          <>
            <div className={styles.actions}>
              <ButtonLink variant="soft" to={r ? `/restaurants/${r.restaurantId}` : '/'}>
                {r ? '가게 보기' : '지도에서 보기'}
              </ButtonLink>
              <ButtonLink to={r ? `/visits/new?restaurantId=${r.restaurantId}` : '/visits/new'}>
                정복하러 가기
              </ButtonLink>
            </div>
            {quest.canChange && (
              <div className={styles.links}>
                <button
                  type="button"
                  disabled={busy || !quest.week.swapAvailable}
                  onClick={() => void change('swap')}
                >
                  <RefreshIcon size={14} />
                  {quest.week.swapAvailable
                    ? '다른 퀘스트로 바꾸기 (이번 주 1번)'
                    : '이번 주는 이미 바꿨어요'}
                </button>
                <button type="button" disabled={busy} onClick={() => void change('dismiss')}>
                  관심 없어요
                </button>
              </div>
            )}
          </>
        )
      }
    >
      <AppHeader title="퀘스트" />
      <div className={styles.content}>
        <p className={styles.detailKind}>
          <span className={styles.levelChip} data-level={quest.level}>
            {quest.isBonus ? '보너스' : quest.levelName}
          </span>
          {joinDot([
            quest.typeName,
            done ? '완료' : quest.week.isCurrent ? dDay(quest.week.daysLeft) : null,
            `+${quest.rewardPoint}P`,
          ])}
        </p>
        <h2 className={styles.detailTitle}>{detailTitle(quest)}</h2>

        {r ? (
          <section className={styles.place} aria-label="가 볼 가게">
            <img src={mealThumb} alt="" className={styles.placeThumb} />
            <div>
              <p className={styles.placeName}>
                {r.name}
                <span className={styles.badge} data-on={r.isConquered}>
                  {r.isConquered ? '정복' : '미정복'}
                </span>
              </p>
              <p className={styles.placeScore}>
                {joinDot([
                  r.tasteScore !== null ? `★ ${formatScore(r.tasteScore)} 맛` : '아직 별점 없음',
                ])}
                {r.myOverallScore !== null && <em> · 내 종합 {formatScore(r.myOverallScore)}</em>}
              </p>
              <p className={styles.placeMeta}>
                {joinDot([
                  r.categoryName,
                  r.regionName,
                  r.distanceM !== null ? formatDistance(r.distanceM) : null,
                ])}
              </p>
            </div>
          </section>
        ) : (
          <section className={styles.place} aria-label="퀘스트 진행">
            <div>
              <p className={styles.placeName}>{quest.region?.name ?? '내 동네 구'}</p>
              <p className={styles.placeMeta}>{quest.summary}</p>
              <p className={styles.placeScore}>
                {quest.progress}/{quest.target}곳 정복
              </p>
            </div>
          </section>
        )}

        {quest.reasons.length > 0 && (
          <section className={styles.why} aria-label="왜 나에게 왔나요?">
            <h3 className={styles.whyTitle}>왜 나에게 왔나요?</h3>
            <ul>
              {quest.reasons.map((reason, i) => {
                const ReasonIcon = REASON_ICONS[i % REASON_ICONS.length];
                return (
                  <li key={reason}>
                    <span className={styles.whyIcon}>
                      <ReasonIcon size={14} />
                    </span>
                    {reason}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {done ? (
          <p className={styles.reward}>
            <GiftIcon size={20} />
            완료한 퀘스트예요 · +{quest.rewardPoint}P 받았어요
          </p>
        ) : (
          <p className={styles.reward}>
            <GiftIcon size={20} />
            {reward}
          </p>
        )}
        <p className={styles.condition}>완료 조건: 방문 인증 + 맛 별점 (리뷰 글은 선택)</p>
      </div>
    </Screen>
  );
}
