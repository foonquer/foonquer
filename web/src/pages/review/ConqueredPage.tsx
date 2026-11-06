import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import type { NextConquestReward, RatingResult } from '../../api/reviews';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { formatPoint, joinDot } from '../../lib/format';
import { iGa } from '../../lib/korean';
import flow from '../visit/Flow.module.css';

/** 정복 완료 /visits/:visitId/conquered — 별점 등록(REVIEW-01) 결과를 이전 화면에서 받는다 */
export function ConqueredPage() {
  const visitId = Number(useParams().visitId);
  const result = useLocation().state as RatingResult | null;
  const navigate = useNavigate();
  // 새로 고침 등으로 결과를 잃었으면 내 리뷰로 (정복은 이미 끝났다)
  if (!result?.reviewId) return <Navigate to="/me/reviews" replace />;

  const { conquest, rewards, celebrations, nextReward } = result;
  const { rank, previousRank, nextTier } = conquest;
  // 피그마 "강서구 8위 → 7위 · 미식가까지 11곳"
  const standing = conquest.isNewConquest
    ? joinDot([
        rank === null
          ? null
          : previousRank !== null && previousRank !== rank
            ? `${conquest.sigunguName} ${previousRank}위 → ${rank}위`
            : `${conquest.sigunguName} ${rank}위`,
        nextTier?.remaining
          ? `${nextTier.tierName}까지 ${nextTier.remaining}곳`
          : conquest.tierTitle,
      ])
    : '이번 시즌에 이미 정복한 가게라 순위는 그대로예요';
  const extras = [
    celebrations.tierUp && {
      label: `${iGa(celebrations.tierUp.tierTitle)} 됐어요`,
      value: '티어 상승',
    },
    celebrations.backgroundUnlocked && {
      label: `${celebrations.backgroundUnlocked.sigunguName} 배경을 얻었어요`,
      value: '꾸미기 배경',
    },
    rewards.levelUp && {
      label: `먹깨비 Lv.${rewards.levelUp.from} → Lv.${rewards.levelUp.to}`,
      value:
        rewards.levelUp.itemBoxCount > 0
          ? `아이템 상자 ${rewards.levelUp.itemBoxCount}개`
          : '레벨 업',
    },
    ...celebrations.achievements.map((a) => ({
      label: `업적 달성 · ${a.name}`,
      value:
        a.rewardItems.length > 0
          ? a.rewardItems.map((i) => i.name).join(', ')
          : `+${formatPoint(a.rewardPoint)}`,
    })),
  ].filter((x): x is { label: string; value: string } => Boolean(x));

  return (
    <Screen
      footer={
        <>
          <Button onClick={() => navigate(`/visits/${visitId}/review`, { replace: true })}>
            세부평가 남기고 포인트 쌓기
          </Button>
          <Button variant="white" onClick={() => navigate('/', { replace: true })}>
            홈으로 돌아가기
          </Button>
        </>
      }
    >
      <AppHeader title="오늘의 정복" onBack={() => navigate('/', { replace: true })} />
      <div className={flow.content}>
        <section className={flow.celebrate} aria-label="정복 완료">
          <span className={flow.badge}>방문 인증 + 맛 별점 등록 완료</span>
          <img src={mukkaebi} alt="" className={flow.mukkaebi} />
          <h2 className={flow.celebrateTitle}>{result.restaurant.name}, 정복 완료!</h2>
          <p className={flow.celebrateSub}>{standing}</p>
        </section>

        {nextReward && <NextReward reward={nextReward} />}

        {(rewards.point > 0 || extras.length > 0) && (
          <section className={flow.card} aria-label="받은 보상">
            <p className={flow.sectionLabel}>받은 보상</p>
            <ul className={flow.list}>
              {rewards.point > 0 && (
                <li>
                  <span>{conquest.isFirstEver ? '새 가게 첫 정복' : '정복 보상'}</span>
                  <strong>+{formatPoint(rewards.point)}</strong>
                </li>
              )}
              {extras.map((x) => (
                <li key={x.label}>
                  <span>{x.label}</span>
                  <strong>{x.value}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={flow.tip}>
          <p className={flow.tipTitle}>세부평가를 남기면 먹포인트 적립</p>
          <p className={flow.tipText}>정복은 완료됐어요. 세부평가는 선택이에요.</p>
        </section>
      </div>
    </Screen>
  );
}

/** 지금 진행 값 (피그마 "누적 정복 8곳") */
const PROGRESS: Record<NextConquestReward['conditionType'], (n: number) => string> = {
  CONQUEST_TOTAL: (n) => `누적 정복 ${n}곳`,
  SIGUNGU_CONQUEST: (n) => `한 구에서 정복 ${n}곳`,
  SEASON_CONQUEST: (n) => `한 시즌에 정복 ${n}곳`,
  DISTRICT_COUNT: (n) => `정복한 구 ${n}개`,
};

/** 다음 정복 보상 카드 (피그마 784:9805) — 아이템을 주면 아이템 이름, 아니면 업적 이름과 포인트 */
function NextReward({ reward }: { reward: NextConquestReward }) {
  const item = reward.rewardItems[0];
  const district = reward.conditionType === 'DISTRICT_COUNT';
  return (
    <section className={flow.card} aria-label="다음 정복 보상">
      <p className={flow.rewardLabel}>다음 정복 보상</p>
      <p className={flow.rewardName}>{item?.name ?? reward.name}</p>
      <p className={flow.rewardText}>
        {district
          ? `새 구 ${reward.remaining}곳에서만 더 정복하면`
          : `${reward.remaining}곳만 더 정복하면`}{' '}
        {item ? '내 것이 돼요!' : `+${formatPoint(reward.rewardPoint)}를 받아요!`}
      </p>
      <span
        className={flow.progress}
        role="progressbar"
        aria-label={`${reward.name} 진행도`}
        aria-valuemin={0}
        aria-valuemax={reward.target}
        aria-valuenow={reward.current}
      >
        <span
          style={{
            width: `${Math.min(100, Math.max(0, (reward.current / reward.target) * 100))}%`,
          }}
        />
      </span>
      <p className={flow.progressFoot}>
        <strong>{PROGRESS[reward.conditionType](reward.current)}</strong>
        <span>
          {district ? `${reward.target}개 구` : `${reward.target}곳`} 달성 시{' '}
          {item ? '해금' : '보상'}
        </span>
      </p>
    </section>
  );
}
