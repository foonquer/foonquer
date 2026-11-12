import { type ReactNode, useState } from 'react';
import {
  type AdminFaq,
  type AdminNotice,
  createFaq,
  createNotice,
  createPolicyDocument,
  FAQ_CATEGORIES,
  type FaqCategory,
  getAdminFaqs,
  getAdminNotices,
  updateFaq,
  updateNotice,
  type Visibility,
} from '../../api/admin';
import { getTerms, type TermsType } from '../../api/support';
import { Button } from '../../components/Button';
import { FilterChips } from '../../components/Chips';
import { Dialog } from '../../components/Dialog';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { usePaged } from '../../lib/usePaged';
import { listError, moreError } from './AdminCommon';
import styles from './Admin.module.css';

const FAQ_LABEL = Object.fromEntries(FAQ_CATEGORIES.map((c) => [c.value, c.label]));
const TERMS: { value: TermsType; label: string }[] = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보 처리방침' },
  { value: 'LOCATION', label: '위치기반 서비스' },
];

/** 숨기기 ↔ 다시 보이기 */
const flip = (s: Visibility): Visibility => (s === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE');

/** 공지 (ADMIN-17 목록, 10 등록, 11 고치기·숨기기) */
export function Notices() {
  const toast = useToast();
  const list = usePaged((page) => getAdminNotices(page), []);
  const [editing, setEditing] = useState<AdminNotice | 'new' | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const toggle = async (n: AdminNotice) => {
    const status = flip(n.status);
    setBusyId(n.noticeId);
    try {
      await updateNotice(n.noticeId, { status });
      list.update((x) => x.noticeId === n.noticeId, { ...n, status });
      toast({
        message: status === 'HIDDEN' ? '공지를 숨겼어요' : '공지를 다시 보여요',
        check: true,
      });
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="공지">
      <div className={styles.toolbar}>
        <span>{list.totalCount}건 · 필독 먼저 최신순</span>
        {editing === null && (
          <Button
            size="sm"
            block={false}
            className={styles.addButton}
            onClick={() => setEditing('new')}
          >
            새 공지
          </Button>
        )}
      </div>
      {editing !== null && (
        <NoticeEditor
          notice={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
      {list.error !== undefined && list.items.length === 0 ? (
        listError(list.error, list.reload)
      ) : list.loading && list.items.length === 0 ? (
        <Loading />
      ) : list.items.length === 0 ? (
        <EmptyState title="공지가 없어요" />
      ) : (
        <ul className={styles.cards}>
          {list.items.map((n) => (
            <li key={n.noticeId}>
              <article className={styles.card} aria-label={`공지 ${n.noticeId}`}>
                <p className={styles.cardHead}>
                  {n.isPinned && <span className={styles.kind}>필독</span>}
                  {n.tag && <span className={styles.kind}>{n.tag}</span>}
                  <strong>{n.title}</strong>
                  {n.status === 'HIDDEN' && <span className={styles.hiddenBadge}>숨김</span>}
                </p>
                <p className={`${styles.body} ${styles.clamp}`}>{n.content}</p>
                <p className={styles.meta}>
                  {joinDot([
                    `${formatDateTime(n.regDate)} 등록`,
                    n.updatedAt && n.updatedAt !== n.regDate
                      ? `${formatDateTime(n.updatedAt)} 고침`
                      : null,
                  ])}
                </p>
                <div className={styles.actions}>
                  <Button size="sm" variant="outline" onClick={() => setEditing(n)}>
                    고치기
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={busyId === n.noticeId}
                    onClick={() => toggle(n)}
                  >
                    {n.status === 'VISIBLE' ? '숨기기' : '다시 보이기'}
                  </Button>
                </div>
              </article>
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
    </section>
  );
}

function NoticeEditor({
  notice,
  onCancel,
  onSaved,
}: {
  /** null이면 새 공지 */
  notice: AdminNotice | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(notice?.title ?? '');
  const [tag, setTag] = useState(notice?.tag ?? '');
  const [isPinned, setPinned] = useState(notice?.isPinned ?? false);
  const [content, setContent] = useState(notice?.content ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const body = {
      title: title.trim(),
      content: content.trim(),
      tag: tag.trim() || null,
      isPinned,
    };
    setBusy(true);
    try {
      if (notice) await updateNotice(notice.noticeId, body);
      else await createNotice(body);
      toast({ message: notice ? '공지를 고쳤어요' : '공지를 올렸어요', check: true });
      onSaved();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.card}
      aria-label={notice ? '공지 고치기' : '새 공지'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="제목">
        <input
          className={styles.input}
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>
      <Field label="말머리 (선택)">
        <input
          className={styles.input}
          maxLength={10}
          value={tag}
          placeholder="예: 이벤트, 점검"
          onChange={(e) => setTag(e.target.value)}
        />
      </Field>
      <label className={styles.check}>
        <input type="checkbox" checked={isPinned} onChange={(e) => setPinned(e.target.checked)} />
        필독으로 맨 위에 두기
      </label>
      <Field label="내용">
        <textarea
          className={styles.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </Field>
      <div className={styles.actions}>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button size="sm" type="submit" disabled={busy || !title.trim() || !content.trim()}>
          {notice ? '고친 내용 저장' : '공지 올리기'}
        </Button>
      </div>
    </form>
  );
}

/** FAQ (ADMIN-18 목록, 12 등록, 13 고치기·숨기기) */
export function Faqs() {
  const toast = useToast();
  const [category, setCategory] = useState<FaqCategory | 'ALL'>('ALL');
  const faqs = useAsync(() => getAdminFaqs(category === 'ALL' ? undefined : category), [category]);
  const [editing, setEditing] = useState<AdminFaq | 'new' | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const toggle = async (f: AdminFaq) => {
    const status = flip(f.status);
    setBusyId(f.faqId);
    try {
      await updateFaq(f.faqId, { status });
      faqs.mutate((prev) => ({
        items: prev.items.map((x) => (x.faqId === f.faqId ? { ...f, status } : x)),
      }));
      toast({ message: status === 'HIDDEN' ? 'FAQ를 숨겼어요' : 'FAQ를 다시 보여요', check: true });
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="FAQ">
      <FilterChips
        label="FAQ 유형"
        value={category}
        onChange={setCategory}
        scroll
        options={[{ value: 'ALL', label: '전체' }, ...FAQ_CATEGORIES]}
      />
      <div className={styles.toolbar}>
        <span>{faqs.data ? `${faqs.data.items.length}개 · 유형·순서대로` : ''}</span>
        {editing === null && (
          <Button
            size="sm"
            block={false}
            className={styles.addButton}
            onClick={() => setEditing('new')}
          >
            새 FAQ
          </Button>
        )}
      </div>
      {editing !== null && (
        <FaqEditor
          faq={editing === 'new' ? null : editing}
          defaultCategory={category === 'ALL' ? 'VISIT' : category}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            faqs.reload();
          }}
        />
      )}
      {faqs.error !== undefined ? (
        listError(faqs.error, faqs.reload)
      ) : !faqs.data ? (
        <Loading />
      ) : faqs.data.items.length === 0 ? (
        <EmptyState title="FAQ가 없어요" />
      ) : (
        <ul className={styles.cards}>
          {faqs.data.items.map((f) => (
            <li key={f.faqId}>
              <article className={styles.card} aria-label={`FAQ ${f.faqId}`}>
                <p className={styles.cardHead}>
                  <span className={styles.kind}>{FAQ_LABEL[f.category] ?? f.category}</span>
                  <strong>{f.question}</strong>
                  {f.status === 'HIDDEN' && <span className={styles.hiddenBadge}>숨김</span>}
                </p>
                <p className={styles.body}>{f.answer}</p>
                <p className={styles.meta}>순서 {f.sortOrder}</p>
                <div className={styles.actions}>
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                    고치기
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={busyId === f.faqId}
                    onClick={() => toggle(f)}
                  >
                    {f.status === 'VISIBLE' ? '숨기기' : '다시 보이기'}
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FaqEditor({
  faq,
  defaultCategory,
  onCancel,
  onSaved,
}: {
  /** null이면 새 FAQ */
  faq: AdminFaq | null;
  defaultCategory: FaqCategory;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState<FaqCategory>(faq?.category ?? defaultCategory);
  const [question, setQuestion] = useState(faq?.question ?? '');
  const [answer, setAnswer] = useState(faq?.answer ?? '');
  const [sortOrder, setSortOrder] = useState(String(faq?.sortOrder ?? 0));
  const [busy, setBusy] = useState(false);
  const order = Number(sortOrder);
  const save = async () => {
    const body = { category, question: question.trim(), answer: answer.trim(), sortOrder: order };
    setBusy(true);
    try {
      if (faq) await updateFaq(faq.faqId, body);
      else await createFaq(body);
      toast({ message: faq ? 'FAQ를 고쳤어요' : 'FAQ를 올렸어요', check: true });
      onSaved();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.card}
      aria-label={faq ? 'FAQ 고치기' : '새 FAQ'}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="유형">
        <select
          className={styles.input}
          value={category}
          onChange={(e) => setCategory(e.target.value as FaqCategory)}
        >
          {FAQ_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="질문">
        <input
          className={styles.input}
          maxLength={100}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
        />
      </Field>
      <Field label="답변">
        <textarea
          className={styles.textarea}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
        />
      </Field>
      <Field label="순서 (작을수록 위)">
        <input
          className={styles.input}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Field>
      <div className={styles.actions}>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button
          size="sm"
          type="submit"
          disabled={
            busy ||
            !question.trim() ||
            !answer.trim() ||
            sortOrder === '' ||
            !Number.isInteger(order) ||
            order < 0
          }
        >
          {faq ? '고친 내용 저장' : 'FAQ 올리기'}
        </Button>
      </div>
    </form>
  );
}

/** 오늘(KST)에서 days일 뒤 "YYYY-MM-DD" */
function kstDate(days: number, now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/** 약관 (CS-07로 보고, ADMIN-14로 새 버전을 올린다. 올린 버전은 고칠 수 없다) */
export function Terms() {
  const [type, setType] = useState<TermsType>('TERMS');
  const terms = useAsync(() => getTerms(type), [type]);
  const [writing, setWriting] = useState(false);
  const today = kstDate(0);

  return (
    <section aria-label="약관">
      <FilterChips
        label="약관 종류"
        value={type}
        scroll
        onChange={(t) => {
          setType(t);
          setWriting(false);
        }}
        options={TERMS}
      />
      {terms.error !== undefined ? (
        listError(terms.error, terms.reload)
      ) : !terms.data ? (
        <Loading />
      ) : (
        <>
          <article className={styles.card} aria-label="시행 중인 버전">
            <p className={styles.cardHead}>
              <span className={styles.kind}>시행 중</span>
              <strong>{terms.data.version}</strong>
            </p>
            <p className={styles.meta}>{formatDate(terms.data.effectiveDate)}부터 시행</p>
            <ul className={styles.versions} aria-label="버전 기록">
              {terms.data.versions.map((v) => (
                <li key={v.version}>
                  {joinDot([
                    v.version,
                    `${formatDate(v.effectiveDate)} 시행`,
                    v.effectiveDate > today ? '시행 예정' : null,
                    v.version === terms.data?.version ? '지금' : null,
                  ])}
                </li>
              ))}
            </ul>
          </article>
          {writing ? (
            <TermsEditor
              type={type}
              current={terms.data.content}
              onCancel={() => setWriting(false)}
              onSaved={() => {
                setWriting(false);
                terms.reload();
              }}
            />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setWriting(true)}>
              새 버전 올리기
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function TermsEditor({
  type,
  current,
  onCancel,
  onSaved,
}: {
  type: TermsType;
  /** 지금 시행 중인 본문 (고쳐 쓰기 쉽게 그대로 채운다) */
  current: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  // 처리방침·약관에 "시행 7일 전부터 알린다"고 적혀 있어 기본 시행일은 7일 뒤
  const [effectiveDate, setEffectiveDate] = useState(kstDate(7));
  const [version, setVersion] = useState(kstDate(7));
  const [content, setContent] = useState(current);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = TERMS.find((t) => t.value === type)?.label ?? type;
  const save = async () => {
    setBusy(true);
    try {
      await createPolicyDocument({
        type,
        version: version.trim(),
        content: content.trim(),
        effectiveDate,
      });
      toast({ message: `${label} 새 버전을 올렸어요`, check: true });
      setAsking(false);
      onSaved();
    } catch (err) {
      setAsking(false);
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={styles.card}
      aria-label={`${label} 새 버전`}
      onSubmit={(e) => {
        e.preventDefault();
        setAsking(true);
      }}
    >
      <p className={styles.notice}>
        올린 버전은 고칠 수 없어요(동의 기록이 버전을 가리켜요). 내용이 바뀌면 시행 7일 전에 공지로
        알려 주세요.
      </p>
      <Field label="시행일">
        <input
          className={styles.input}
          type="date"
          value={effectiveDate}
          onChange={(e) => {
            // 버전 이름을 손대지 않았으면 시행일을 따라간다
            if (version === effectiveDate) setVersion(e.target.value);
            setEffectiveDate(e.target.value);
          }}
          required
        />
      </Field>
      <Field label="버전 이름">
        <input
          className={styles.input}
          maxLength={20}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          required
        />
      </Field>
      <Field label="본문">
        <textarea
          className={`${styles.textarea} ${styles.tall}`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </Field>
      <div className={styles.actions}>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button
          size="sm"
          type="submit"
          disabled={busy || !effectiveDate || !version.trim() || !content.trim()}
        >
          새 버전 올리기
        </Button>
      </div>
      <Dialog
        open={asking}
        title={`${label} 새 버전을 올릴까요?`}
        description={[
          `${formatDate(effectiveDate)}부터 시행돼요. 올린 뒤에는 고칠 수 없어요.`,
          content.trim() === current.trim() ? '본문이 지금 버전과 같아요.' : '',
        ].filter(Boolean)}
        confirmLabel="올리기"
        busy={busy}
        onCancel={() => setAsking(false)}
        onConfirm={save}
      />
    </form>
  );
}

/** 이름표 + 입력칸 (label이 입력칸을 감싸서 이어진다) */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}
