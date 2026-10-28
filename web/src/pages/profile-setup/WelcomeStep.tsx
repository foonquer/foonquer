import { AGE_LABEL, GENDER_LABEL, type Welcome } from '../../api/users';
import egg from '../../assets/illust/mukkaebi-egg.svg';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { iGa } from '../../lib/korean';
import { setNextAction } from '../../lib/session';
import type { ProfileDraft } from './ProfileSetupPage';
import styles from './WelcomeStep.module.css';

/** 먹깨비 단계 이름과 안내 (가입 직후는 알) */
const STAGE_TEXT: Record<string, string> = { E: '알 · 맛집을 정복하면 알이 깨어나요' };

// Figma S-07 카드의 색종이 (left, top, 너비, 높이, 기울기, 색)
const CONFETTI = [
  { left: 60, top: 87, w: 10, h: 5, rotate: -30, color: '#f2c14e' },
  { left: 288, top: 82, w: 9, h: 5, rotate: 25, color: '#ea7b66' },
  { left: 40, top: 195, w: 8, h: 4, rotate: -60, color: '#9ed4a5' },
  { left: 310, top: 189, w: 10, h: 5, rotate: -15, color: '#a9c8ea' },
  { left: 107, top: 58, w: 7, h: 4, rotate: 40, color: '#ea7b66' },
  { left: 250, top: 49, w: 8, h: 4, rotate: -40, color: '#f2c14e' },
];

type Props = { welcome: Welcome; draft: ProfileDraft };

/** S-07 가입 완료: USER-03 응답의 welcome으로 탐험가 카드와 첫 목표를 보여 준다 */
export function WelcomeStep({ welcome, draft }: Props) {
  const { firstGoal, mukkaebi } = welcome;
  const firstRegion = draft.regions[0];
  const profileLine = [
    draft.gender && draft.gender !== 'N' ? GENDER_LABEL[draft.gender] : null,
    draft.ageGroup ? AGE_LABEL[draft.ageGroup] : null,
    firstRegion ? `${firstRegion.sigunguName} ${firstRegion.dongName}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const percent = firstGoal.target > 0 ? (firstGoal.current / firstGoal.target) * 100 : 0;

  return (
    <Screen
      footer={
        // 홈으로 보내는 일은 라우트 가드가 한다 (프로필 설정 단계가 끝났으므로)
        <Button onClick={() => setNextAction('HOME')}>첫 맛집 찾으러 가기</Button>
      }
    >
      <div className={styles.wrap}>
        <section className={styles.card} aria-label="가입 완료">
          <p className={styles.season}>
            {welcome.seasonNo ? `SEASON ${welcome.seasonNo} · ` : ''}NEW EXPLORER
          </p>
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className={styles.confetti}
              aria-hidden="true"
              style={{
                left: c.left,
                top: c.top,
                width: c.w,
                height: c.h,
                background: c.color,
                transform: `rotate(${c.rotate}deg)`,
              }}
            />
          ))}
          <span className={styles.glow} aria-hidden="true" />
          <img src={egg} alt="" className={styles.egg} />
          <h1 className={styles.name}>{draft.nickname}</h1>
          <span className={styles.tier}>{welcome.tierTitle}</span>
          <p className={styles.profile}>{profileLine}</p>
          <p className={styles.level}>
            LV.{mukkaebi.level}
            {STAGE_TEXT[mukkaebi.stage] ? ` ${STAGE_TEXT[mukkaebi.stage]}` : ''}
          </p>
        </section>

        <section className={styles.goal} aria-label="첫 목표">
          <div className={styles.goalHead}>
            <span className={styles.goalLabel}>첫 목표</span>
            <span className={styles.goalCount}>
              {firstGoal.current} / {firstGoal.target}곳
            </span>
          </div>
          <p className={styles.goalText}>
            {`${firstGoal.sigunguName} 맛집 ${firstGoal.target}곳을 정복하면\n${iGa(firstGoal.nextTierName)} 돼요`}
          </p>
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={firstGoal.target}
            aria-valuenow={firstGoal.current}
          >
            <div className={styles.barFill} style={{ width: `${percent}%` }} />
          </div>
        </section>
      </div>
    </Screen>
  );
}
