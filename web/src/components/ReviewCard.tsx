import { useState } from 'react';
import { Link } from 'react-router';
import { cancelReaction, reactReview, type Review } from '../api/reviews';
import { errorMessage } from '../lib/api';
import { formatMonthDay, formatScore, joinDot } from '../lib/format';
import { MukkaebiAvatar } from './Mukkaebi';
import { useToast } from './Toast';
import styles from './ReviewCard.module.css';

const DETAIL_LABELS = [
  ['cleanliness', '청결'],
  ['portion', '양'],
  ['service', '서비스'],
  ['price', '가격'],
] as const;

/** "청결 4 · 양 5 · 서비스 5 · 가격 4" */
function detailLine(review: Pick<Review, 'detailScores'>) {
  const d = review.detailScores;
  return d ? DETAIL_LABELS.map(([key, label]) => `${label} ${d[key]}`).join(' · ') : null;
}

type Props = {
  review: Review;
  /** 가게 이름을 보여 준다 (내 리뷰 목록) */
  showRestaurant?: boolean;
  /** 도움돼요를 바꾸면 목록의 값도 바꾼다 */
  onChange?: (review: Review) => void;
};

/** 방문 인증 리뷰 카드 (작성자·맛 별점·세부 별점·인증 칩·글·사진·도움돼요) */
export function ReviewCard({ review: r, showRestaurant, onChange }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const react = async (type: 'HELPFUL' | 'UNHELPFUL') => {
    setBusy(true);
    try {
      const result =
        r.myReaction === type
          ? await cancelReaction(r.reviewId)
          : await reactReview(r.reviewId, type);
      onChange?.({ ...r, myReaction: result.myReaction, helpfulCount: result.helpfulCount });
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const details = detailLine(r);
  return (
    <article className={styles.card} aria-label={`${r.author.nickname ?? '탐방러'}의 리뷰`}>
      {showRestaurant ? (
        <div className={styles.head}>
          <Link to={`/restaurants/${r.restaurant.restaurantId}`} className={styles.restaurant}>
            {r.restaurant.name}
          </Link>
          <span className={styles.date}>{formatMonthDay(r.visitedAt ?? r.regDate)} 방문</span>
        </div>
      ) : (
        <div className={styles.head}>
          {r.author.profileImageUrl ? (
            <img src={r.author.profileImageUrl} alt="" className={styles.avatar} />
          ) : (
            <MukkaebiAvatar size={36} />
          )}
          <div className={styles.author}>
            <p className={styles.nickname}>{r.author.nickname ?? '탐방러'}</p>
            <p className={styles.authorMeta}>
              {joinDot([
                r.author.title,
                r.author.trustTemp !== null ? `신뢰 온도 ${r.author.trustTemp.toFixed(1)}°` : null,
              ])}
            </p>
          </div>
          <span className={styles.date}>{formatMonthDay(r.visitedAt ?? r.regDate)} 방문</span>
        </div>
      )}

      <p className={styles.scores}>
        <span className={styles.taste}>
          맛 <span className={styles.star}>★</span> {formatScore(r.overallScore)}
        </span>
        {details && <span className={styles.details}>{details}</span>}
      </p>

      <p className={styles.chips}>
        <span data-tone="green">
          ✓ {r.verificationMethod === 'RECEIPT' ? '영수증 인증' : '현장 인증'}
        </span>
        <span>{r.overallScore >= 3 ? '재방문 의사 있음' : '재방문 의사 없음'}</span>
        <span>{r.author.isLocal ? '로컬' : '외부 방문'}</span>
      </p>

      {r.aspects.length > 0 && (
        <p className={styles.aspects}>
          {r.aspects.map((a) => (
            <span key={a.aspectId} data-polarity={a.polarity}>
              {a.name} {a.polarity === 'G' ? '좋음' : '아쉬움'}
            </span>
          ))}
        </p>
      )}

      {r.content ? (
        <p className={styles.content}>{r.content}</p>
      ) : (
        r.isMine && <p className={styles.empty}>별점만 남겼어요 · 글 쓰면 +30P</p>
      )}

      {r.imageUrls.length > 0 && (
        <div className={styles.photos}>
          {r.imageUrls.map((url) => (
            <img key={url} src={url} alt="리뷰 사진" loading="lazy" />
          ))}
        </div>
      )}

      <div className={styles.footer}>
        {r.isMine ? (
          <>
            <span className={styles.helpfulCount}>도움돼요 {r.helpfulCount}</span>
            {showRestaurant && (
              <Link to={`/reviews/${r.reviewId}`} className={styles.more}>
                자세히 ›
              </Link>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.reaction}
              aria-pressed={r.myReaction === 'HELPFUL'}
              disabled={busy}
              onClick={() => react('HELPFUL')}
            >
              도움돼요 {r.helpfulCount}
            </button>
            <button
              type="button"
              className={styles.reaction}
              aria-pressed={r.myReaction === 'UNHELPFUL'}
              disabled={busy}
              onClick={() => react('UNHELPFUL')}
            >
              도움 안 돼요
            </button>
          </>
        )}
      </div>
    </article>
  );
}
