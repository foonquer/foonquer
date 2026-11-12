import { useState } from 'react';
import { Link } from 'react-router';
import {
  type AdminMember,
  type AdminMemberStatus,
  changeMemberStatus,
  getMembers,
} from '../../api/admin';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { Dialog } from '../../components/Dialog';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, joinDot } from '../../lib/format';
import { usePaged } from '../../lib/usePaged';
import { listError, moreError } from './AdminCommon';
import styles from './Admin.module.css';

const STATUS_LABEL: Record<AdminMemberStatus, string> = {
  PENDING: '가입 중',
  ACTIVE: '활동 중',
  SUSPENDED: '이용 정지',
  WITHDRAWN: '탈퇴',
};

/** 상태 칩. PHOTO_PENDING = 탈퇴하고 3일이 지나도 사진을 다 못 지운 회원 */
type Filter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN' | 'PHOTO_PENDING';

const nameOf = (m: AdminMember) =>
  m.nickname ?? (m.status === 'WITHDRAWN' ? '탈퇴한 탐험가' : '탐험가');

/** 회원 (ADMIN-15 찾기, 16 이용 정지·해제) */
export function Members() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [typing, setTyping] = useState('');
  const [nickname, setNickname] = useState('');
  const [asking, setAsking] = useState<AdminMember | null>(null);
  const [busy, setBusy] = useState(false);
  const list = usePaged(
    (page) =>
      getMembers({
        nickname: nickname || undefined,
        status: filter === 'ALL' || filter === 'PHOTO_PENDING' ? undefined : filter,
        photoPurgePending: filter === 'PHOTO_PENDING' || undefined,
        page,
        size: 20,
      }),
    [filter, nickname],
  );

  const run = async () => {
    if (!asking) return;
    const next = asking.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setBusy(true);
    try {
      await changeMemberStatus(asking.userId, next);
      toast({
        message: next === 'SUSPENDED' ? '이용 정지했어요' : '이용 정지를 풀었어요',
        check: true,
      });
      list.update((x) => x.userId === asking.userId, { ...asking, status: next });
      setAsking(null);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="회원">
      <form
        className={styles.search}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setNickname(typing.trim());
        }}
      >
        <input
          className={styles.input}
          aria-label="닉네임"
          placeholder="닉네임 일부"
          maxLength={10}
          value={typing}
          onChange={(e) => setTyping(e.target.value)}
        />
        <Button size="sm" block={false} type="submit" className={styles.addButton}>
          찾기
        </Button>
      </form>
      <FilterChips
        label="회원 상태"
        value={filter}
        onChange={setFilter}
        scroll
        options={[
          { value: 'ALL', label: '전체' },
          { value: 'ACTIVE', label: '활동 중' },
          { value: 'SUSPENDED', label: '이용 정지' },
          { value: 'WITHDRAWN', label: '탈퇴' },
          { value: 'PHOTO_PENDING', label: '사진 삭제 대기' },
        ]}
      />
      <div className={styles.toolbar}>
        <span>{list.totalCount}명 · 최근 가입 순</span>
      </div>
      {list.error !== undefined && list.items.length === 0 ? (
        listError(list.error, list.reload)
      ) : list.loading && list.items.length === 0 ? (
        <Loading />
      ) : list.items.length === 0 ? (
        <EmptyState
          title={filter === 'PHOTO_PENDING' ? '사진 삭제가 밀린 회원이 없어요' : '회원이 없어요'}
        />
      ) : (
        <ul className={styles.cards}>
          {list.items.map((m) => (
            <li key={m.userId}>
              <MemberCard member={m} onAction={() => setAsking(m)} />
            </li>
          ))}
        </ul>
      )}
      {list.error !== undefined && list.items.length > 0 && moreError(list.error, list.retry)}
      {list.hasNext && (
        <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
          더 보기
        </Button>
      )}
      <Dialog
        open={asking !== null}
        title={
          asking
            ? `${nameOf(asking)}님을 ${asking.status === 'SUSPENDED' ? '정지 해제할까요?' : '이용 정지할까요?'}`
            : ''
        }
        description={
          asking
            ? [
                asking.status === 'SUSPENDED'
                  ? '다시 앱을 쓸 수 있어요.'
                  : '이 탐험가는 앱을 쓸 수 없게 돼요. 신뢰 온도는 그대로예요.',
              ]
            : []
        }
        confirmLabel={asking?.status === 'SUSPENDED' ? '정지 풀기' : '이용 정지'}
        busy={busy}
        onCancel={() => setAsking(null)}
        onConfirm={run}
      />
    </section>
  );
}

function MemberCard({ member: m, onAction }: { member: AdminMember; onAction: () => void }) {
  return (
    <article className={styles.card} aria-label={`회원 ${m.userId}`}>
      <p className={styles.cardHead}>
        <span className={styles.kind}>{STATUS_LABEL[m.status]}</span>
        {m.status === 'ACTIVE' ? (
          <Link to={`/users/${m.userId}`}>
            <strong>{nameOf(m)}</strong>
          </Link>
        ) : (
          <strong>{nameOf(m)}</strong>
        )}
        <span className={styles.meta}>#{m.userId}</span>
        {m.role === 'ADMIN' && <span className={styles.kind}>운영자</span>}
      </p>
      <p className={styles.meta}>
        {joinDot([
          `신뢰 온도 ${m.trustTemp.toFixed(1)}°`,
          m.pendingReportCount > 0 ? `처리 전 신고 ${m.pendingReportCount}건` : null,
          `${formatDate(m.regDate)} 가입`,
          m.lastLoginAt ? `${formatDateTime(m.lastLoginAt)} 접속` : null,
          m.withdrawnAt ? `${formatDate(m.withdrawnAt)} 탈퇴` : null,
        ])}
      </p>
      {m.photoPurgePending && (
        <p className={styles.alert} role="note">
          사진 삭제 대기 · 저장소 오류로 영수증·현장·문의·프로필 사진을 아직 다 못 지웠어요. 매일
          다시 지워요.
        </p>
      )}
      {(m.status === 'ACTIVE' || m.status === 'SUSPENDED') && m.role !== 'ADMIN' && (
        <Button
          size="sm"
          variant={m.status === 'SUSPENDED' ? 'outline' : 'primary'}
          onClick={onAction}
        >
          {m.status === 'SUSPENDED' ? '정지 풀기' : '이용 정지'}
        </Button>
      )}
    </article>
  );
}
