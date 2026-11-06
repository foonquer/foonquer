import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { Button } from './Button';
import { Screen } from './Screen';
import styles from './ResultScreen.module.css';

type Action = { label: string; onClick: () => void; disabled?: boolean };

type Props = {
  /** 동그라미 안 아이콘 (메일·체크) */
  icon: string;
  title: string;
  /** 설명. 줄바꿈은 \n */
  description: ReactNode;
  /** 흰 안내 카드 */
  info?: { title: string; bullets: string[] };
  /** 회색 글자 흰 버튼 (위) */
  secondary?: Action;
  /** 초록 버튼 (아래) */
  primary: Action;
  /** 뒤로 가기 대신 할 일 (없으면 뒤로 가기 버튼을 숨긴다) */
  onBack?: () => void;
};

/** 결과 안내 화면 (메일 발송, 비밀번호 변경 완료, 계정 연동 확인, 링크 만료) */
export function ResultScreen({
  icon,
  title,
  description,
  info,
  secondary,
  primary,
  onBack,
}: Props) {
  return (
    <Screen
      footer={
        <>
          {secondary && (
            <Button
              variant="plain"
              radius={16}
              onClick={secondary.onClick}
              disabled={secondary.disabled}
            >
              {secondary.label}
            </Button>
          )}
          <Button radius={16} onClick={primary.onClick} disabled={primary.disabled}>
            {primary.label}
          </Button>
        </>
      }
    >
      <AppHeader onBack={onBack} hideBack={!onBack} />
      <div className={styles.body}>
        <span className={styles.iconCircle}>
          <img src={icon} alt="" />
        </span>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.description}>{description}</p>
        {info && (
          <div className={styles.info}>
            <p className={styles.infoTitle}>{info.title}</p>
            <ul className={styles.bullets}>
              {info.bullets.map((bullet) => (
                <li key={bullet}>• {bullet}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Screen>
  );
}
