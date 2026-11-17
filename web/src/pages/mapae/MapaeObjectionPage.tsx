import { useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  createMapaeObjection,
  OBJECTION_REASONS,
  type ObjectionReason,
  OWNER_RELATIONS,
  type OwnerRelation,
} from '../../api/mapae';
import { getRestaurant, type RestaurantDetail } from '../../api/restaurants';
import { IMAGE_ACCEPT, uploadImage } from '../../api/uploads';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import styles from './Mapae.module.css';

/** 설명 최대 길이 (서버 MAPAE-03과 같다) */
const CONTENT_MAX = 1000;

/** 사장님 이의제기 /restaurants/:restaurantId/mapae-objection (피그마 M5). 접수하면 마패 문의 내역(M6)으로 */
export function MapaeObjectionPage() {
  const restaurantId = Number(useParams().restaurantId);
  const { data, error, reload } = useAsync(() => getRestaurant(restaurantId), [restaurantId]);
  if (data?.hasMapae) return <ObjectionForm restaurant={data} />;
  return (
    <Screen>
      <AppHeader title="사장님 이의제기" />
      {error ? (
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      ) : data ? (
        <EmptyState title="마패가 표시된 가게만 이의제기할 수 있어요" />
      ) : (
        <Loading />
      )}
    </Screen>
  );
}

function ObjectionForm({ restaurant: r }: { restaurant: RestaurantDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const ids = { relation: useId(), reason: useId(), content: useId() };
  const [relation, setRelation] = useState<OwnerRelation | ''>('');
  const [reason, setReason] = useState<ObjectionReason | ''>('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const ready = relation !== '' && reason !== '' && content.trim() !== '';
  const send = async () => {
    if (relation === '' || reason === '' || !content.trim()) return;
    setSending(true);
    try {
      const imageKey = file ? await uploadImage(file, 'INQUIRY') : null;
      const { inquiryId } = await createMapaeObjection(r.restaurantId, {
        relation,
        reason,
        content: content.trim(),
        imageKey,
      });
      navigate(`/support?inquiryId=${inquiryId}&received=1`, { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setSending(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <p className={styles.footNote}>
            담당자가 확인 후 앱 내 문의로 답변해 드려요.
            <br />
            필요하면 가게 운영 확인 자료를 요청할 수 있어요.
          </p>
          <Button onClick={send} disabled={!ready || sending}>
            {sending ? '보내는 중…' : '이의제기 접수하기'}
          </Button>
        </>
      }
    >
      <AppHeader title="사장님 이의제기" />
      <div className={styles.content}>
        <p className={styles.sub}>우리 가게의 마패 정보를 다시 확인해 주세요</p>
        <section className={styles.card} aria-label="대상 가게 · 마패 정보">
          <p className={styles.cardLabel}>대상 가게 · 마패 정보</p>
          <p className={styles.cardStrong}>{r.name}</p>
          <p className={styles.cardText}>리뷰 이벤트 진행 가게로 표시 중이에요</p>
        </section>

        <div className={styles.field}>
          <label htmlFor={ids.relation} className={styles.cardTitle}>
            가게와의 관계
          </label>
          <select
            id={ids.relation}
            className={styles.select}
            value={relation}
            onChange={(e) => setRelation(e.target.value as OwnerRelation)}
          >
            <option value="" disabled>
              대표자 / 매장 관리자 선택
            </option>
            {OWNER_RELATIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor={ids.reason} className={styles.cardTitle}>
            이의제기 사유
          </label>
          <select
            id={ids.reason}
            className={styles.select}
            value={reason}
            onChange={(e) => setReason(e.target.value as ObjectionReason)}
          >
            <option value="" disabled>
              사유 선택
            </option>
            {OBJECTION_REASONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor={ids.content} className={styles.cardTitle}>
            설명 및 변경 시점
          </label>
          <textarea
            id={ids.content}
            className={styles.textarea}
            placeholder="마패 정보와 다른 점, 종료일 등을 적어 주세요."
            maxLength={CONTENT_MAX}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <p className={styles.cardTitle}>확인 자료</p>
          <div className={styles.attach}>
            <label className={styles.attachButton}>
              {file ? `첨부: ${file.name}` : '+ 안내문 · 종료 공지 등 첨부'}
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                hidden
                data-testid="objection-photo-input"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
            {file && (
              <button type="button" aria-label="첨부한 자료 빼기" onClick={() => setFile(null)}>
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
}
