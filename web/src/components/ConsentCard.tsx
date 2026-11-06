import { Link } from 'react-router';
import checkOn from '../assets/icons/check-circle.svg';
import chevron from '../assets/icons/chevron-right-small.svg';
import type { Consents } from '../api/auth';
import styles from './ConsentCard.module.css';

const ITEMS: { key: keyof Consents; label: string; type: string }[] = [
  { key: 'terms', label: '[필수] 서비스 이용약관', type: 'TERMS' },
  { key: 'privacy', label: '[필수] 개인정보 수집·이용', type: 'PRIVACY' },
  { key: 'location', label: '[필수] 위치기반 서비스 이용약관', type: 'LOCATION' },
  { key: 'marketing', label: '[선택] 이벤트·혜택 알림', type: 'MARKETING' },
];

/** 동그란 체크 (22px) */
export function CheckCircle({ checked }: { checked: boolean }) {
  return checked ? (
    <img src={checkOn} alt="" className={styles.check} />
  ) : (
    <span className={styles.check} data-off="true" />
  );
}

type Props = { value: Consents; onChange: (value: Consents) => void };

/** 약관 동의 카드 (모두 동의 + 필수 3개 + 선택 1개). 오른쪽 › 은 약관 전문 (새 창) */
export function ConsentCard({ value, onChange }: Props) {
  const all = ITEMS.every((item) => value[item.key]);
  const toggleAll = () => onChange({ terms: !all, privacy: !all, location: !all, marketing: !all });

  return (
    <div className={styles.card}>
      <label className={styles.row}>
        <input type="checkbox" className="sr-only" checked={all} onChange={toggleAll} />
        <CheckCircle checked={all} />
        <span className={styles.all}>모두 동의할게요</span>
      </label>
      <div className={styles.divider} />
      {ITEMS.map((item) => (
        <div key={item.key} className={styles.row}>
          <label className={styles.item}>
            <input
              type="checkbox"
              className="sr-only"
              checked={value[item.key]}
              onChange={() => onChange({ ...value, [item.key]: !value[item.key] })}
            />
            <CheckCircle checked={value[item.key]} />
            <span className={styles.label}>{item.label}</span>
          </label>
          <Link
            to={`/terms?type=${item.type}`}
            target="_blank"
            rel="noopener"
            className={styles.more}
            aria-label={`${item.label.replace(/\[.+\] /, '')} 자세히 보기`}
          >
            <img src={chevron} alt="" width={5} height={10} />
          </Link>
        </div>
      ))}
    </div>
  );
}
