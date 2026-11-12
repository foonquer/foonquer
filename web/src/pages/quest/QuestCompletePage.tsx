import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import type { RatingResult } from '../../api/reviews';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { Button } from '../../components/Button';
import { ItemIcon } from '../../components/ItemIcon';
import { Screen } from '../../components/Screen';
import { formatPoint } from '../../lib/format';
import { categoryOfCode } from '../../lib/itemArt';
import { eulReul } from '../../lib/korean';
import { CheckIcon, FlagIcon, GiftIcon, SparkleIcon } from './QuestIcons';
import styles from './Quest.module.css';

/** 4주 연속 완료하면 칭호 (업적 "꾸준한 탐험가") */
const STREAK_GOAL = 4;

/**
 * 퀘스트 완료 /visits/:visitId/quest (피그마 Q4) → 이번 주 퀘스트를 모두 깼으면 주간 상자 (Q5).
 * 별점 등록(REVIEW-01) 결과를 이전 화면에서 받고, 다 보면 정복 결과로 이어 간다
 */
export function QuestCompletePage() {
  const visitId = Number(useParams().visitId);
  const result = useLocation().state as RatingResult | null;
  const navigate = useNavigate();
  const [step, setStep] = useState<'done' | 'box'>('done');
  if (!result?.quest)
    return <Navigate to={`/visits/${visitId}/conquered`} replace state={result} />;

  const { quest } = result;
  const first = quest.completed[0];
  const point = quest.completed.reduce((sum, q) => sum + q.rewardPoint, 0);
  const { baseCount, doneCount, boxId, streak } = quest.week;
  const remaining = baseCount - doneCount;
  const toConquered = () =>
    navigate(`/visits/${visitId}/conquered`, { replace: true, state: result });

  if (step === 'box') {
    // 연속 기록: 4주를 한 바퀴로 보여 준다 (4주째면 칭호)
    const lap = ((streak - 1) % STREAK_GOAL) + 1;
    return (
      <Screen
        footer={
          <>
            <Button onClick={() => navigate('/me/mukkaebi/boxes', { replace: true })}>
              상자 열기
            </Button>
            <Button variant="white" onClick={toConquered}>
              나중에 열기 (아이템 상자 목록에 보관)
            </Button>
          </>
        }
      >
        <div className={styles.done}>
          <span className={styles.hero} data-tone="box">
            <GiftIcon size={96} />
          </span>
          <span className={styles.pill} data-tone="box">
            이번 주 {baseCount}/{baseCount} 완료
          </span>
          <h1 className={styles.doneTitle}>주간 아이템 상자를 받았어요</h1>
          <p className={styles.doneSub}>레어 아이템이 나올 확률이 평소보다 높아요</p>

          <section className={styles.panel} aria-label="연속 완료">
            <p className={styles.panelHead}>
              {streak}주 연속 완료 중<em>4주 → 칭호</em>
            </p>
            <div className={styles.weeks}>
              {Array.from({ length: STREAK_GOAL }, (_, i) => (
                <span key={i} data-on={i < lap} data-goal={i === STREAK_GOAL - 1}>
                  {i < lap ? <CheckIcon size={18} /> : <GiftIcon size={18} />}
                  {i + 1}주
                </span>
              ))}
            </div>
            <p className={styles.panelText}>
              {lap === STREAK_GOAL
                ? '4주 연속 완료! 칭호 "꾸준한 탐험가"를 받았어요'
                : `${STREAK_GOAL - lap}주 더 연속으로 완료하면 칭호 "꾸준한 탐험가"를 받아요`}
            </p>
          </section>

          {quest.bonusQuest && (
            <section className={styles.bonus} aria-label="보너스 퀘스트">
              <span className={styles.bonusIcon}>
                <FlagIcon size={18} />
              </span>
              <div>
                <p className={styles.bonusTitle}>보너스 퀘스트가 열렸어요</p>
                <p className={styles.bonusText}>
                  {quest.bonusQuest.typeName} · {quest.bonusQuest.title} · +
                  {quest.bonusQuest.rewardPoint}P
                </p>
              </div>
            </section>
          )}
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {boxId !== null ? (
            <Button onClick={() => setStep('box')}>주간 상자 받기</Button>
          ) : (
            <Button onClick={() => navigate('/', { replace: true, state: { openQuests: true } })}>
              남은 퀘스트 보기
            </Button>
          )}
          <Button variant="white" onClick={toConquered}>
            정복 결과 보기
          </Button>
        </>
      }
    >
      <div className={styles.done}>
        <span className={styles.hero}>
          <img src={mukkaebi} alt="" />
        </span>
        <span className={styles.pill}>퀘스트 완료</span>
        <h1 className={styles.doneTitle}>{first.typeName} 성공!</h1>
        <p className={styles.doneSub}>{eulReul(result.restaurant.name)} 정복했어요</p>

        <section className={styles.panel} aria-label="받은 보상">
          <div className={styles.panelRow}>
            <span className={styles.boxIcon}>
              <SparkleIcon size={18} />
            </span>
            <div>
              <p className={styles.panelTitle} data-tone="point">
                +{formatPoint(point)} 받았어요
              </p>
              <p className={styles.panelText}>퀘스트 보상 · 방문 인증 포인트는 따로 적립돼요</p>
            </div>
          </div>
        </section>

        {baseCount > 0 && (
          <section className={styles.panel} aria-label="이번 주 퀘스트">
            <p className={styles.panelHead}>
              이번 주 퀘스트
              <strong>
                {doneCount}/{baseCount}
              </strong>
            </p>
            <div className={styles.segments} aria-hidden="true">
              {Array.from({ length: baseCount }, (_, i) => (
                <span key={i} data-on={i < doneCount} />
              ))}
            </div>
            <p className={styles.panelText}>
              {remaining > 0
                ? `${remaining}개 더 깨면 주간 아이템 상자를 받아요`
                : boxId !== null
                  ? '이번 주 퀘스트를 모두 깼어요! 주간 상자를 받으세요'
                  : '이번 주 퀘스트를 모두 깼어요'}
            </p>
          </section>
        )}

        {quest.achievements.map((a) => (
          <section key={a.name} className={styles.panel} aria-label="업적 달성">
            <p className={styles.panelTitle}>업적 달성 · {a.name}</p>
            {a.rewardPoint > 0 && <p className={styles.panelText}>+{formatPoint(a.rewardPoint)}</p>}
            {a.rewardItems.map((i) => (
              <div key={i.code} className={styles.achievementItem}>
                <ItemIcon category={categoryOfCode(i.code)} rarity="H" code={i.code} size={40} />
                <p className={styles.panelText}>
                  <strong>{eulReul(i.name)} 받았어요</strong> · 꾸미기에서 착용해 보세요
                </p>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Screen>
  );
}
