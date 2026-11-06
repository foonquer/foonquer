import { useState } from 'react';
import { Link } from 'react-router';
import { getBlocks, unblockMember } from '../../api/profile';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatKoreanDate } from '../../lib/format';
import { usePaged } from '../../lib/usePaged';
import styles from './Blocks.module.css';

/** 차단한 탐험가 /me/blocks (BLOCK-03, 풀기는 BLOCK-02) */
export function BlocksPage() {
  const toast = useToast();
  const list = usePaged((page) => getBlocks({ page, size: 30 }), []);
  const [released, setReleased] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);

  const release = async (userId: number) => {
    setBusy(userId);
    try {
      const { message } = await unblockMember(userId);
      setReleased((s) => new Set(s).add(userId));
      toast(message.replace(/\.$/, ''));
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const items = list.items.filter((b) => !released.has(b.userId));
  return (
    <Screen>
      <AppHeader title="차단한 탐험가" />
      <div className={styles.content}>
        <p className={styles.note}>차단한 탐험가의 리뷰는 보이지 않아요. 상대방은 알 수 없어요.</p>
        {list.error !== undefined && list.items.length === 0 ? (
          <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
        ) : list.loading && list.items.length === 0 ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="차단한 탐험가가 없어요" />
        ) : (
          <ul className={styles.rows}>
            {items.map((b) => (
              <li key={b.userId} className={styles.row}>
                <Link to={`/users/${b.userId}`} className={styles.who}>
                  {b.profileImageUrl ? (
                    <img src={b.profileImageUrl} alt="" className={styles.photo} />
                  ) : (
                    <MukkaebiAvatar size={40} />
                  )}
                  <span className={styles.text}>
                    <strong>{b.nickname ?? '탐험가'}</strong>
                    <small>{formatKoreanDate(b.blockedAt)} 차단</small>
                  </span>
                </Link>
                <Button
                  variant="white"
                  size="sm"
                  block={false}
                  aria-label={`${b.nickname ?? '탐험가'} 차단 풀기`}
                  onClick={() => release(b.userId)}
                  disabled={busy === b.userId}
                >
                  차단 풀기
                </Button>
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
