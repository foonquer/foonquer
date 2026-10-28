import type { ReactNode } from 'react';
import { Link } from 'react-router';
import chevron from '../assets/icons/chevron-right.svg';
import styles from './MenuList.module.css';

export type MenuItem = {
  label: ReactNode;
  /** 오른쪽 회색 글자 (개수, 지금 값) */
  value?: ReactNode;
  /** 이동할 주소 또는 누를 때 할 일. 둘 다 없으면 보기만 하는 줄 */
  to?: string;
  onClick?: () => void;
  /** 회색 글자 (회원 탈퇴처럼 덜 눈에 띄게) */
  muted?: boolean;
};

/** 흰 카드 안의 메뉴 줄들 (내 정보·설정). 줄 사이에 얇은 선 */
export function MenuList({ items, label }: { items: MenuItem[]; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {items.map((item, i) => {
        const body = (
          <>
            <span className={styles.label} data-muted={item.muted}>
              {item.label}
            </span>
            <span className={styles.right}>
              {item.value !== undefined && <span className={styles.value}>{item.value}</span>}
              {(item.to || item.onClick) && <img src={chevron} alt="" width={6} height={11} />}
            </span>
          </>
        );
        return (
          <li key={i} className={styles.item}>
            {item.to ? (
              <Link to={item.to} className={styles.row}>
                {body}
              </Link>
            ) : item.onClick ? (
              <button type="button" className={styles.row} onClick={item.onClick}>
                {body}
              </button>
            ) : (
              <div className={styles.row}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 메뉴 묶음 위 작은 제목 (설정: 위치 / 계정 / 정보) */
export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}
