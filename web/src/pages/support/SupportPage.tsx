import { useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  createInquiry,
  getFaqs,
  getInquiry,
  getMyInquiries,
  INQUIRY_CATEGORIES,
  type InquiryCategory,
} from '../../api/support';
import { IMAGE_ACCEPT, uploadImage } from '../../api/uploads';
import { AppHeader } from '../../components/AppHeader';
import { Button, ButtonLink } from '../../components/Button';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatKoreanDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import styles from './Support.module.css';

/** 문의 내용 최대 길이 (서버 CS-04와 같다) */
const CONTENT_MAX = 1000;

const categoryLabel = (c: InquiryCategory) =>
  INQUIRY_CATEGORIES.find((i) => i.value === c)?.label ?? c;

/** 고객센터 /support?inquiryId= — 자주 묻는 질문·1:1 문의·내 문의 (CS-03~06). 답변 알림은 inquiryId를 달고 온다 */
export function SupportPage() {
  const inquiryId = Number(useSearchParams()[0].get('inquiryId')) || null;
  return inquiryId ? <InquiryDetail inquiryId={inquiryId} /> : <Support />;
}

function Support() {
  const toast = useToast();
  const contentId = useId();
  const faqs = useAsync(getFaqs, []);
  const mine = useAsync(() => getMyInquiries(), []);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [category, setCategory] = useState<InquiryCategory | null>(null);
  const [content, setContent] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const send = async () => {
    if (!category || !content.trim()) return;
    setSending(true);
    try {
      const imageKey = photo ? await uploadImage(photo, 'INQUIRY') : null;
      await createInquiry({ category, content: content.trim(), imageKey });
      toast({ message: '문의를 보냈어요. 답변은 알림으로 알려 드려요', check: true });
      setCategory(null);
      setContent('');
      setPhoto(null);
      mine.reload();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="고객센터" />
      <div className={styles.content}>
        <h2 className={styles.sectionTitle}>자주 묻는 질문</h2>
        {faqs.data ? (
          <ul className={styles.list}>
            {faqs.data.items.map((f) => (
              <li key={f.faqId} className={styles.faq}>
                <button
                  type="button"
                  aria-expanded={openFaq === f.faqId}
                  onClick={() => setOpenFaq(openFaq === f.faqId ? null : f.faqId)}
                >
                  <span>Q. {f.question}</span>
                  <span aria-hidden="true">⌄</span>
                </button>
                {openFaq === f.faqId && <p className={styles.answer}>{f.answer}</p>}
              </li>
            ))}
          </ul>
        ) : faqs.error ? (
          <EmptyState title={errorMessage(faqs.error)} onRetry={faqs.reload} />
        ) : (
          <Loading />
        )}

        <section className={styles.card} aria-label="1:1 문의하기">
          <h2 className={styles.sectionTitle}>1:1 문의하기</h2>
          <ChoiceGroup
            label="문의 유형"
            options={INQUIRY_CATEGORIES}
            value={category}
            onChange={setCategory}
            columns={4}
            size="sm"
            height={40}
          />
          <label htmlFor={contentId} className={styles.srOnly}>
            문의 내용
          </label>
          <textarea
            id={contentId}
            className={styles.textarea}
            placeholder="어떤 점이 불편했는지 자세히 알려 주세요"
            maxLength={CONTENT_MAX}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className={styles.counter}>
            {content.length} / {CONTENT_MAX}
          </p>
          <div className={styles.attach}>
            <button type="button" onClick={() => fileInput.current?.click()}>
              {photo ? `사진: ${photo.name}` : '+ 사진 첨부 (선택)'}
            </button>
            {photo && (
              <button type="button" aria-label="첨부한 사진 빼기" onClick={() => setPhoto(null)}>
                ×
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_ACCEPT}
              hidden
              data-testid="inquiry-photo-input"
              onChange={(e) => {
                setPhoto(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </div>
          <p className={styles.note}>답변은 알림으로 알려 드려요 · 보통 1~2일 걸려요</p>
          <Button onClick={send} disabled={!category || !content.trim() || sending}>
            문의 보내기
          </Button>
        </section>

        {mine.data && mine.data.items.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>내 문의</h2>
            <ul className={styles.list}>
              {mine.data.items.map((i) => (
                <li key={i.inquiryId}>
                  <Link to={`/support?inquiryId=${i.inquiryId}`} className={styles.row}>
                    <span className={styles.rowTitle}>
                      <span className={styles.status} data-answered={i.status === 'ANSWERED'}>
                        {i.status === 'ANSWERED' ? '답변 완료' : '답변 대기'}
                      </span>
                      {i.contentPreview}
                    </span>
                    <span className={styles.rowMeta}>
                      {categoryLabel(i.category)} · {formatKoreanDate(i.regDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Screen>
  );
}

function InquiryDetail({ inquiryId }: { inquiryId: number }) {
  const { data, error, reload } = useAsync(() => getInquiry(inquiryId), [inquiryId]);
  return (
    <Screen
      footer={
        <ButtonLink to="/support" variant="white">
          고객센터로
        </ButtonLink>
      }
    >
      <AppHeader title="내 문의" />
      {error ? (
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={styles.content}>
          <article className={styles.article}>
            <span className={styles.status} data-answered={data.status === 'ANSWERED'}>
              {data.status === 'ANSWERED' ? '답변 완료' : '답변 대기'}
            </span>
            <p className={styles.rowMeta}>
              {categoryLabel(data.category)} · {formatKoreanDate(data.regDate)}
              {data.refVisit?.restaurantName && ` · ${data.refVisit.restaurantName}`}
            </p>
            <p className={styles.articleBody}>{data.content}</p>
            {data.imageUrl && (
              <img src={data.imageUrl} alt="첨부한 사진" className={styles.photo} />
            )}
          </article>
          <article className={styles.article} aria-label="답변">
            <h2 className={styles.sectionTitle}>답변</h2>
            <p className={styles.articleBody}>
              {data.answer ?? '아직 답변을 준비하고 있어요. 답변이 오면 알림으로 알려 드려요.'}
            </p>
            {data.answeredAt && (
              <p className={styles.rowMeta}>{formatKoreanDate(data.answeredAt)}</p>
            )}
          </article>
        </div>
      )}
    </Screen>
  );
}
