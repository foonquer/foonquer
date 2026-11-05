import { AppHeader } from '../../components/AppHeader';
import { PageTitle } from '../../components/PageTitle';
import styles from './ProfileSetup.module.css';

type Props = {
  /** 1 ~ 3 */
  step: number;
  /** 단계 칩 이름 (닉네임 / 기본 정보 · 좋아하는 음식 / 내 동네) */
  name: string;
  title: string;
  description: string;
};

/** 프로필 설정 위쪽: "프로필 설정 · 1 / 3" + 진행 막대 + 단계 칩 + 제목 */
export function StepHeader({ step, name, title, description }: Props) {
  return (
    <>
      <AppHeader title="프로필 설정" right={<span className={styles.stepCount}>{step} / 3</span>} />
      <div
        className={styles.progress}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step}
      >
        <div className={styles.progressFill} style={{ width: `${(step / 3) * 100}%` }} />
      </div>
      <span className={styles.stepChip}>
        {step}/3 · {name}
      </span>
      <div className={styles.titleWrap}>
        <PageTitle title={title} description={description} />
      </div>
    </>
  );
}
