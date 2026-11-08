import { Link } from 'react-router';
import bellIcon from '../assets/icons/bell.svg';
import styles from './NotificationBell.module.css';

/** 알림함으로 가는 종. 안 읽은 알림이 있을 때만 빨간 점 (HOME-01 unreadNotificationCount) */
export function NotificationBell({ unread, className }: { unread: number; className?: string }) {
  return (
    <Link
      to="/notifications"
      className={`${styles.bell} ${className ?? ''}`}
      aria-label={unread > 0 ? `알림 (안 읽은 알림 ${unread}개)` : '알림'}
    >
      <img src={bellIcon} alt="" width={24} height={24} />
      {unread > 0 && <span className={styles.dot} aria-hidden="true" />}
    </Link>
  );
}
