import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import type { RatingResult } from '../../api/reviews';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { avatarColor, ME_COLOR } from '../../lib/crew';
import { formatPoint } from '../../lib/format';
import { eulReul, gwaWa } from '../../lib/korean';
import { AwardIcon, SparkleIcon, UsersIcon } from '../quest/QuestIcons';
import quest from '../quest/Quest.module.css';
import styles from './Crew.module.css';

/**
 * 함께 정복 완료 /visits/:visitId/together (피그마 G6). 별점 등록(REVIEW-01) 결과를 이전 화면에서 받고,
 * 다 보면 퀘스트 완료(있으면) → 정복 결과로 이어 간다
 */
export function CrewTogetherPage() {
  const visitId = Number(useParams().visitId);
  const result = useLocation().state as RatingResult | null;
  const navigate = useNavigate();
  const next = `/visits/${visitId}/${result?.quest ? 'quest' : 'conquered'}`;
  if (!result?.crew) return <Navigate to={next} replace state={result} />;

  const [first, ...others] = result.crew.together;
  const partners = first.partners.join(' · ');

  return (
    <Screen
      footer={
        <>
          <Button onClick={() => navigate(next, { replace: true, state: result })}>
            {result.quest ? '퀘스트 완료 보기' : '정복 결과 보기'}
          </Button>
          <Button
            variant="white"
            onClick={() => navigate(`/crews/${first.crewId}`, { replace: true })}
          >
            모임 공간으로
          </Button>
        </>
      }
    >
      <div className={quest.done}>
        <span className={styles.togetherHero}>
          <span className={quest.hero}>
            <img src={mukkaebi} alt="" />
          </span>
          <span className={styles.heroAvatars} aria-hidden="true">
            {first.partners.map((p, i) => (
              <span key={`${p}-${i}`} style={{ background: avatarColor(i + 1) }}>
                {Array.from(p)[0]}
              </span>
            ))}
            <span style={{ background: ME_COLOR }}>나</span>
          </span>
        </span>
        <span className={quest.pill}>함께 정복</span>
        <h1 className={quest.doneTitle}>함께 정복 완료!</h1>
        <p className={quest.doneSub}>
          {gwaWa(partners)} {eulReul(first.restaurantName)} 정복했어요
        </p>

        <section className={quest.panel} aria-label="함께 정복 보상">
          {first.rewardPoint > 0 && (
            <div className={quest.panelRow}>
              <span className={quest.boxIcon}>
                <SparkleIcon size={18} />
              </span>
              <div>
                <p className={quest.panelTitle}>+{formatPoint(first.rewardPoint)} 각자 받았어요</p>
                <p className={quest.panelText}>모임 퀘스트 "함께 정복" 완료</p>
              </div>
            </div>
          )}
          {first.badges.map((b) => (
            <div key={b} className={quest.panelRow}>
              <span className={styles.badgeIconSmall}>
                <AwardIcon size={18} />
              </span>
              <div>
                <p className={quest.panelTitle}>모임 배지 "{b}"</p>
                <p className={quest.panelText}>
                  {first.crewName} · 함께 정복 {first.conquestCount}곳째
                </p>
              </div>
            </div>
          ))}
          {first.rewardPoint === 0 && first.badges.length === 0 && (
            <div className={quest.panelRow}>
              <span className={styles.badgeIconSmall}>
                <UsersIcon size={18} />
              </span>
              <div>
                <p className={quest.panelTitle}>{first.crewName}</p>
                <p className={quest.panelText}>함께 정복 {first.conquestCount}곳째</p>
              </div>
            </div>
          )}
        </section>

        {others.map((c) => (
          <p key={c.crewId} className={styles.hint}>
            {c.crewName}에서도 함께 정복했어요 · {c.conquestCount}곳째
          </p>
        ))}

        <p className={styles.note}>
          <UsersIcon size={18} />
          같이 간 모임원들의 리뷰는 가게 별점에 한 묶음으로 반영돼요. 친구끼리 별점을 몰아주지
          않도록 하는 장치예요.
        </p>
      </div>
    </Screen>
  );
}
