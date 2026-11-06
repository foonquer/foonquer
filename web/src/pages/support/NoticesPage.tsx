import { Link, useSearchParams } from 'react-router';
import { getNotice, getNotices } from '../../api/support';
import { AppHeader } from '../../components/AppHeader';
import { Button, ButtonLink } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { usePaged } from '../../lib/usePaged';
import styles from './Support.module.css';

/** 공지사항 /notices?noticeId= (CS-01·02). 공지 알림은 noticeId를 달고 온다 */
export function NoticesPage() {
  const noticeId = Number(useSearchParams()[0].get('noticeId')) || null;
  return noticeId ? <NoticeDetail noticeId={noticeId} /> : <NoticeList />;
}

/** "2026.09.20" */
const dotDate = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

function NoticeList() {
  const list = usePaged((page) => getNotices(page), []);
  return (
    <Screen>
      <AppHeader title="공지사항" />
      <div className={styles.content}>
        {list.error && list.items.length === 0 ? (
          <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
        ) : list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <EmptyState title="아직 공지가 없어요" />
        ) : (
          <ul className={styles.list}>
            {list.items.map((n) => (
              <li key={n.noticeId}>
                <Link to={`/notices?noticeId=${n.noticeId}`} className={styles.row}>
                  <span className={styles.rowTitle}>
                    {n.title}
                    {n.isPinned && <span className={styles.pinned}>필독</span>}
                    {!n.isPinned && n.tag && <span className={styles.tag}>{n.tag}</span>}
                  </span>
                  <span className={styles.rowMeta}>{dotDate(n.regDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.hasNext && (
          <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
            더 보기
          </Button>
        )}
      </div>
    </Screen>
  );
}

function NoticeDetail({ noticeId }: { noticeId: number }) {
  const { data, error, reload } = useAsync(() => getNotice(noticeId), [noticeId]);
  return (
    <Screen
      footer={
        <ButtonLink to="/notices" variant="white">
          목록으로
        </ButtonLink>
      }
    >
      <AppHeader title="공지사항" />
      {error ? (
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <article className={styles.article}>
          {(data.isPinned || data.tag) && (
            <span className={styles.pinned}>{data.isPinned ? '필독' : data.tag}</span>
          )}
          <h2 className={styles.articleTitle}>{data.title}</h2>
          <p className={styles.rowMeta}>
            {dotDate(data.regDate)} · 먹장깨기 운영팀
            {data.updatedAt && ` · ${formatDate(data.updatedAt)} 수정`}
          </p>
          <p className={styles.articleBody}>{data.content}</p>
        </article>
      )}
    </Screen>
  );
}
