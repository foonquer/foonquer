import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  type AppNotification,
  deleteNotification,
  getNotifications,
  type NotificationCategory,
  readAllNotifications,
  readNotification,
} from '../../api/notifications';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { agoGroup, formatAgo, joinDot } from '../../lib/format';
import { usePaged } from '../../lib/usePaged';
import styles from './Support.module.css';

type Filter = 'ALL' | NotificationCategory;

/** 묶음 이름 순서대로 (최신순 그대로) */
function grouped(items: AppNotification[]) {
  const groups: { name: string; items: AppNotification[] }[] = [];
  for (const n of items) {
    const name = agoGroup(n.regDate);
    const last = groups[groups.length - 1];
    if (last?.name === name) last.items.push(n);
    else groups.push({ name, items: [n] });
  }
  return groups;
}

/** 알림함 /notifications (NOTI-01·03·04·05) — 누르면 읽음 처리하고 그 화면으로 */
export function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('ALL');
  const category = filter === 'ALL' ? undefined : filter;
  const list = usePaged((page) => getNotifications({ category, page, size: 30 }), [filter]);
  const unread = list.first?.unreadCount ?? 0;

  // 다시 부르면 "더 보기"로 늘린 목록이 1쪽으로 돌아가서, 받은 목록을 그 자리에서 고친다
  const open = async (n: AppNotification) => {
    try {
      const { deepLink } = await readNotification(n.notificationId);
      list.edit((p) => ({
        ...p,
        unreadCount: p.unreadCount - (n.isRead ? 0 : 1),
        items: p.items.map((i) =>
          i.notificationId === n.notificationId ? { ...i, isRead: true } : i,
        ),
      }));
      if (deepLink) navigate(deepLink);
    } catch (err) {
      toast(errorMessage(err));
    }
  };
  const readAll = async () => {
    try {
      await readAllNotifications(category);
      list.edit((p) => ({
        ...p,
        unreadCount: 0,
        items: p.items.map((i) => ({ ...i, isRead: true })),
      }));
    } catch (err) {
      toast(errorMessage(err));
    }
  };
  const remove = async (n: AppNotification) => {
    try {
      await deleteNotification(n.notificationId);
      list.edit((p) => ({
        ...p,
        unreadCount: p.unreadCount - (n.isRead ? 0 : 1),
        totalCount: p.totalCount - 1,
        items: p.items.filter((i) => i.notificationId !== n.notificationId),
      }));
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  return (
    <Screen>
      <AppHeader
        title="알림"
        right={
          <button
            type="button"
            className={styles.headerLink}
            onClick={readAll}
            disabled={unread === 0}
          >
            모두 읽음
          </button>
        }
      />
      <div className={styles.content}>
        <FilterChips
          label="알림 종류"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: '전체' },
            { value: 'RANK', label: '정복·순위' },
            { value: 'REVIEW', label: '리뷰' },
            { value: 'MUKKAEBI', label: '먹깨비' },
          ]}
        />
        {list.error && list.items.length === 0 ? (
          <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
        ) : list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="새 알림이 없어요"
            description="정복·순위·리뷰 소식이 생기면 알려 드릴게요."
          />
        ) : (
          grouped(list.items).map((g) => (
            <section key={g.name} aria-label={g.name}>
              <h2 className={styles.groupTitle}>{g.name}</h2>
              <ul className={styles.list}>
                {g.items.map((n) => (
                  <li key={n.notificationId} className={styles.notification} data-read={n.isRead}>
                    <button
                      type="button"
                      className={styles.notificationBody}
                      onClick={() => open(n)}
                    >
                      {!n.isRead && <span className={styles.dot} aria-label="안 읽음" />}
                      <span className={styles.notificationTitle}>{n.title}</span>
                      <span className={styles.notificationText}>
                        {joinDot([n.content, formatAgo(n.regDate)])}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`${n.title} 지우기`}
                      onClick={() => remove(n)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {list.hasNext && (
          <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
            더 보기
          </Button>
        )}
        <p className={styles.note}>알림은 30일 동안 보관돼요</p>
      </div>
    </Screen>
  );
}
