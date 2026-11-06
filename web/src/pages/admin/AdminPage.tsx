import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  type AdminInquiry,
  type AdminReport,
  answerInquiry,
  getInquiries,
  getReports,
  processReport,
  type ReportAction,
  type ReportStatus,
} from '../../api/admin';
import { REPORT_REASONS } from '../../api/profile';
import { INQUIRY_CATEGORIES } from '../../api/support';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { Dialog } from '../../components/Dialog';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDateTime, formatScore, joinDot } from '../../lib/format';
import { usePaged } from '../../lib/usePaged';
import styles from './Admin.module.css';

const ANSWER_MAX = 1000;

const REASON = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
const CATEGORY = Object.fromEntries(INQUIRY_CATEGORIES.map((c) => [c.value, c.label]));
const REVIEW_STATUS = {
  VISIBLE: '보이는 중',
  HIDDEN: '블라인드',
  FAKE: '허위 판정',
  DELETED: '삭제됨',
};
const MEMBER_STATUS = {
  PENDING: '가입 중',
  ACTIVE: '활동 중',
  SUSPENDED: '이용 정지',
  WITHDRAWN: '탈퇴',
};

/** 조치마다 버튼 이름과 확인창 설명 (서버 ADMIN-02와 같다) */
const ACTIONS: Record<ReportAction, { label: string; effect: string }> = {
  HIDE_REVIEW: { label: '블라인드', effect: '리뷰를 가리고 작성자 신뢰 온도를 3° 내려요.' },
  FAKE_REVIEW: {
    label: '허위 판정',
    effect: '리뷰를 허위로 판정하고 작성자 신뢰 온도를 5° 내려요.',
  },
  SUSPEND_MEMBER: {
    label: '이용 정지',
    effect: '이 탐험가는 앱을 쓸 수 없게 되고 신뢰 온도가 3° 내려가요.',
  },
  REJECT: { label: '반려', effect: '이 신고만 문제없음으로 끝내요.' },
};

/** 운영 관리 /admin?tab=reports|inquiries — 신고 처리(ADMIN-01·02), 1:1 문의 답변(ADMIN-08·09). 운영자만 */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'inquiries' ? 'inquiries' : 'reports';
  return (
    <Screen>
      <AppHeader title="운영 관리" />
      <div className={styles.content}>
        <div className={styles.tabs} role="tablist" aria-label="운영 관리">
          {(
            [
              ['reports', '신고'],
              ['inquiries', '1:1 문의'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setParams({ tab: value }, { replace: true })}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'reports' ? <Reports /> : <Inquiries />}
      </div>
    </Screen>
  );
}

/** 운영자가 아니면 서버가 403을 준다 */
function listError(error: unknown, reload: () => void) {
  return error instanceof ApiError && error.status === 403 ? (
    <EmptyState title="운영자만 볼 수 있어요" />
  ) : (
    <EmptyState title={errorMessage(error)} onRetry={reload} />
  );
}

function Reports() {
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus>('PENDING');
  const [target, setTarget] = useState<'ALL' | 'REVIEW' | 'MEMBER'>('ALL');
  const [asking, setAsking] = useState<{ report: AdminReport; action: ReportAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = usePaged(
    (page) =>
      getReports({
        status,
        targetType: target === 'ALL' ? undefined : target,
        page,
        size: 20,
      }),
    [status, target],
  );

  const run = async () => {
    if (!asking) return;
    setBusy(true);
    try {
      const result = await processReport(asking.report.reportId, asking.action);
      toast({
        message:
          result.closedCount > 1
            ? `${ACTIONS[asking.action].label} 처리했어요 · 같은 대상 신고 ${result.closedCount}건을 함께 끝냈어요`
            : `${ACTIONS[asking.action].label} 처리했어요`,
        check: true,
      });
      setAsking(null);
      list.reload();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="신고">
      <FilterChips
        label="신고 상태"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'PENDING', label: '처리 전' },
          { value: 'DONE', label: '조치 완료' },
          { value: 'REJECTED', label: '반려' },
        ]}
      />
      <div className={styles.toolbar}>
        <span>{list.totalCount}건 · 오래된 순</span>
        <select
          aria-label="신고 대상"
          className={styles.select}
          value={target}
          onChange={(e) => setTarget(e.target.value as typeof target)}
        >
          <option value="ALL">전체</option>
          <option value="REVIEW">리뷰</option>
          <option value="MEMBER">탐험가</option>
        </select>
      </div>
      {list.error !== undefined && list.items.length === 0 ? (
        listError(list.error, list.reload)
      ) : list.loading && list.items.length === 0 ? (
        <Loading />
      ) : list.items.length === 0 ? (
        <EmptyState title="신고가 없어요" />
      ) : (
        <ul className={styles.cards}>
          {list.items.map((r) => (
            <li key={r.reportId}>
              <ReportCard report={r} onAction={(action) => setAsking({ report: r, action })} />
            </li>
          ))}
        </ul>
      )}
      {list.hasNext && (
        <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
          더 보기
        </Button>
      )}
      <Dialog
        open={asking !== null}
        title={asking ? `${ACTIONS[asking.action].label}할까요?` : ''}
        description={
          asking
            ? [
                ACTIONS[asking.action].effect,
                asking.action !== 'REJECT' && asking.report.pendingCount > 1
                  ? `같은 대상의 처리 전 신고 ${asking.report.pendingCount}건이 함께 끝나요.`
                  : '',
              ].filter(Boolean)
            : []
        }
        confirmLabel={asking ? ACTIONS[asking.action].label : ''}
        busy={busy}
        onCancel={() => setAsking(null)}
        onConfirm={run}
      />
    </section>
  );
}

function ReportCard({
  report: r,
  onAction,
}: {
  report: AdminReport;
  onAction: (action: ReportAction) => void;
}) {
  const actions: ReportAction[] =
    r.targetType === 'REVIEW'
      ? ['HIDE_REVIEW', 'FAKE_REVIEW', 'REJECT']
      : ['SUSPEND_MEMBER', 'REJECT'];
  return (
    <article className={styles.card} aria-label={`신고 ${r.reportId}`}>
      <p className={styles.cardHead}>
        <span className={styles.kind}>
          {r.targetType === 'REVIEW' ? '리뷰 신고' : '탐험가 신고'}
        </span>
        <strong>{REASON[r.reason] ?? r.reason}</strong>
      </p>
      {r.review && (
        <Link to={`/reviews/${r.review.reviewId}`} className={styles.target}>
          <span className={styles.targetMeta}>
            {joinDot([
              r.review.restaurant.name,
              r.review.author.nickname ?? '탐험가',
              `맛 ★ ${formatScore(r.review.overallScore)}`,
              REVIEW_STATUS[r.review.status],
            ])}
          </span>
          {r.review.content && <span className={styles.targetText}>{r.review.content}</span>}
        </Link>
      )}
      {r.member && (
        <Link to={`/users/${r.member.userId}`} className={styles.target}>
          <span className={styles.targetMeta}>
            {joinDot([
              r.member.nickname ?? '탐험가',
              MEMBER_STATUS[r.member.status],
              `신뢰 온도 ${r.member.trustTemp.toFixed(1)}°`,
            ])}
          </span>
        </Link>
      )}
      {!r.review && !r.member && <p className={styles.targetMeta}>대상을 찾을 수 없어요</p>}
      {r.detail && <p className={styles.detail}>“{r.detail}”</p>}
      <p className={styles.meta}>
        {joinDot([
          `신고한 사람 ${r.reporter.nickname ?? '탐험가'}`,
          formatDateTime(r.regDate),
          r.status === 'PENDING' && r.pendingCount > 1
            ? `같은 대상 신고 ${r.pendingCount}건`
            : null,
          r.processedAt ? `${formatDateTime(r.processedAt)} 처리` : null,
        ])}
      </p>
      {r.status === 'PENDING' && (
        <div className={styles.actions}>
          {actions.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={a === 'REJECT' ? 'outline' : 'primary'}
              onClick={() => onAction(a)}
            >
              {ACTIONS[a].label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

function Inquiries() {
  const [status, setStatus] = useState<'WAITING' | 'ANSWERED'>('WAITING');
  const list = usePaged((page) => getInquiries({ status, page, size: 20 }), [status]);
  return (
    <section aria-label="1:1 문의">
      <FilterChips
        label="문의 상태"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'WAITING', label: '답변 전' },
          { value: 'ANSWERED', label: '답변 완료' },
        ]}
      />
      <div className={styles.toolbar}>
        <span>{list.totalCount}건 · 오래된 순</span>
      </div>
      {list.error !== undefined && list.items.length === 0 ? (
        listError(list.error, list.reload)
      ) : list.loading && list.items.length === 0 ? (
        <Loading />
      ) : list.items.length === 0 ? (
        <EmptyState
          title={status === 'WAITING' ? '답변할 문의가 없어요' : '답변한 문의가 없어요'}
        />
      ) : (
        <ul className={styles.cards}>
          {list.items.map((i) => (
            <li key={i.inquiryId}>
              <InquiryCard
                inquiry={i}
                // 답변 전 목록에서는 답하면 빼고, 답변 완료 목록에서는 고친 답을 그 자리에 둔다
                onAnswered={(answer) =>
                  status === 'WAITING'
                    ? list.edit((page) => ({
                        ...page,
                        items: page.items.filter((x) => x.inquiryId !== i.inquiryId),
                        totalCount: Math.max(0, page.totalCount - 1),
                      }))
                    : list.update((x) => x.inquiryId === i.inquiryId, { ...i, answer })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {list.hasNext && (
        <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
          더 보기
        </Button>
      )}
    </section>
  );
}

function InquiryCard({
  inquiry: i,
  onAnswered,
}: {
  inquiry: AdminInquiry;
  onAnswered: (answer: string) => void;
}) {
  const toast = useToast();
  const [answer, setAnswer] = useState(i.answer ?? '');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const result = await answerInquiry(i.inquiryId, answer.trim());
      toast({
        message: result.notified ? '답변을 보내고 알림을 보냈어요' : '답변을 고쳤어요',
        check: true,
      });
      onAnswered(answer.trim());
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const fieldId = `answer-${i.inquiryId}`;
  return (
    <article className={styles.card} aria-label={`문의 ${i.inquiryId}`}>
      <p className={styles.cardHead}>
        <span className={styles.kind}>{CATEGORY[i.category] ?? i.category}</span>
        <strong>{i.user.nickname ?? '탐험가'}</strong>
      </p>
      <p className={styles.body}>{i.content}</p>
      {i.imageUrl && <img src={i.imageUrl} alt="문의에 붙인 사진" className={styles.photo} />}
      <p className={styles.meta}>
        {joinDot([
          formatDateTime(i.regDate),
          i.refVisitId ? `방문 인증 #${i.refVisitId}` : null,
          i.answeredAt ? `${formatDateTime(i.answeredAt)} 답변` : null,
        ])}
      </p>
      <label htmlFor={fieldId} className={styles.label}>
        답변
      </label>
      <textarea
        id={fieldId}
        className={styles.textarea}
        maxLength={ANSWER_MAX}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="문의한 탐험가에게 보낼 답변을 적어 주세요"
      />
      <span className={styles.counter}>
        {answer.length} / {ANSWER_MAX}
      </span>
      <Button
        size="sm"
        onClick={send}
        disabled={busy || answer.trim().length === 0 || answer.trim() === (i.answer ?? '')}
      >
        {i.status === 'WAITING' ? '답변 보내기' : '답변 고치기'}
      </Button>
    </article>
  );
}
