import { useEffect, useId, useRef, useState } from 'react';
import { IMAGE_ACCEPT } from '../../api/uploads';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { StarInput } from '../../components/StarRating';
import styles from './Review.module.css';
import { CONTENT_MAX, DETAIL_ITEMS, PHOTO_MAX, type ReviewFormValue } from './reviewValue';

type Props = {
  value: ReviewFormValue;
  onChange: (value: ReviewFormValue) => void;
  aspectOptions: { aspectId: number; name: string }[];
};

/** 세부평가 입력: 세부 별점 4항목 · 좋았던/아쉬웠던 점 · 세부 리뷰 · 사진 */
export function ReviewForm({ value, onChange, aspectOptions }: Props) {
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const contentId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<ReviewFormValue>) => onChange({ ...value, ...patch });

  // 화면을 떠나면 미리 보기 주소를 놓아 준다
  const photosRef = useRef(value.photos);
  useEffect(() => {
    photosRef.current = value.photos;
  }, [value.photos]);
  useEffect(() => () => photosRef.current.forEach((p) => p.file && URL.revokeObjectURL(p.url)), []);

  /** 한 번 누르면 좋았던 점, 두 번 누르면 아쉬웠던 점, 세 번이면 없앤다 */
  const cycleAspect = (aspectId: number) => {
    const next = { ...value.aspects };
    if (!next[aspectId]) next[aspectId] = 'G';
    else if (next[aspectId] === 'G') next[aspectId] = 'B';
    else delete next[aspectId];
    set({ aspects: next });
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const room = PHOTO_MAX - value.photos.length;
    const added = Array.from(files)
      .slice(0, room)
      .map((file) => ({ key: null, url: URL.createObjectURL(file), file }));
    set({ photos: [...value.photos, ...added] });
  };

  const removePhoto = (index: number) => {
    const photo = value.photos[index];
    if (photo.file) URL.revokeObjectURL(photo.url);
    set({ photos: value.photos.filter((_, i) => i !== index) });
  };

  return (
    <>
      <section className={styles.card} aria-label="세부 별점">
        {DETAIL_ITEMS.map((item) => (
          <div key={item.key} className={styles.scoreRow}>
            <span className={styles.scoreLabel}>{item.label}</span>
            <StarInput
              label={`${item.label} 별점`}
              value={value.scores[item.key] ?? null}
              onChange={(v) => set({ scores: { ...value.scores, [item.key]: v } })}
              size={26}
            />
          </div>
        ))}
      </section>
      <p className={styles.scoreNote}>
        맛은 앞에서 남겼어요 · 3점 = 기대한 만큼
        <button type="button" className={styles.linkButton} onClick={() => setCriteriaOpen(true)}>
          기준 보기 ›
        </button>
      </p>

      {aspectOptions.length > 0 && (
        <section className={styles.card} aria-label="좋았던 점 · 아쉬웠던 점">
          <h3 className={styles.cardTitle}>좋았던 점 · 아쉬웠던 점 (선택)</h3>
          <p className={styles.cardHint}>
            한 번 누르면 좋았던 점, 두 번 누르면 아쉬웠던 점으로 남아요
          </p>
          <div className={styles.aspects}>
            {aspectOptions.map((a) => {
              const polarity = value.aspects[a.aspectId];
              return (
                <button
                  key={a.aspectId}
                  type="button"
                  className={styles.aspect}
                  data-polarity={polarity ?? 'none'}
                  aria-label={`${a.name} ${polarity === 'G' ? '좋음' : polarity === 'B' ? '아쉬움' : '고르지 않음'}`}
                  onClick={() => cycleAspect(a.aspectId)}
                >
                  {a.name}
                  {polarity === 'G' ? ' 좋음' : polarity === 'B' ? ' 아쉬움' : ''}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className={styles.card} aria-label="세부 리뷰">
        <label htmlFor={contentId} className={styles.cardTitle}>
          세부 리뷰 (선택)
        </label>
        <textarea
          id={contentId}
          className={styles.textarea}
          placeholder="메뉴, 분위기, 추천 포인트를 자유롭게 적어 주세요"
          maxLength={CONTENT_MAX}
          value={value.content}
          onChange={(e) => set({ content: e.target.value })}
        />
        <div className={styles.photos}>
          {value.photos.map((photo, i) => (
            <span key={photo.url} className={styles.photo}>
              <img src={photo.url} alt={`리뷰 사진 ${i + 1}`} />
              <button
                type="button"
                aria-label={`사진 ${i + 1} 빼기`}
                onClick={() => removePhoto(i)}
              >
                ×
              </button>
            </span>
          ))}
          {value.photos.length < PHOTO_MAX && (
            <button
              type="button"
              className={styles.addPhoto}
              onClick={() => fileInput.current?.click()}
            >
              <span aria-hidden="true">+</span>
              <span>
                {value.photos.length}/{PHOTO_MAX}
              </span>
              <span className={styles.srOnly}>사진 추가</span>
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            hidden
            data-testid="review-photo-input"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <p className={styles.contentFoot}>
          <span>비워 두어도 포인트는 적립돼요</span>
          <span>
            {value.content.length} / {CONTENT_MAX}
          </span>
        </p>
      </section>

      <DetailCriteriaSheet open={criteriaOpen} onClose={() => setCriteriaOpen(false)} />
    </>
  );
}

const DETAIL_CRITERIA = [
  {
    score: 5,
    title: '기대 이상',
    text: '이것 때문에 다시 오고 싶어요',
    example: '맛이 확실히 특별함 · 응대가 감동적임',
  },
  { score: 4, title: '만족', text: '기대보다 좋았어요', example: '양이 넉넉함 · 테이블이 깔끔함' },
  {
    score: 3,
    title: '보통',
    text: '딱 기대한 만큼, 불만은 없어요',
    example: '무난한 맛 · 평범한 응대',
  },
  {
    score: 2,
    title: '아쉬움',
    text: '기대보다 부족했어요',
    example: '양이 적음 · 응대가 무심함 · 값에 비해 아쉬움',
  },
  {
    score: 1,
    title: '문제 있음',
    text: '분명히 불편하거나 불쾌했어요',
    example: '위생 불량 · 불친절 · 납득 안 되는 가격',
  },
];

/** 세부 별점 기준 시트 (5-1) */
function DetailCriteriaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} label="세부 별점 기준">
      <h2 className={styles.sheetTitle}>세부 별점 기준</h2>
      <p className={styles.sheetNote}>
        청결·양·서비스·가격 모두 같은 기준이에요. 맛은 앞 단계의 맛 기준표로 남겨요.
        <br />
        다른 가게와 비교하지 말고, 이 메뉴·이 가격에서 기대한 만큼을 3점으로 생각해 주세요.
      </p>
      <ul className={styles.detailCriteria}>
        {DETAIL_CRITERIA.map((c) => (
          <li key={c.score}>
            <p className={styles.detailCriteriaHead}>
              <span className={styles.star}>{'★'.repeat(c.score)}</span>
              <span className={styles.emptyStar}>{'★'.repeat(5 - c.score)}</span> {c.score}점 ·{' '}
              {c.title}
            </p>
            <p>{c.text}</p>
            <p className={styles.detailCriteriaExample}>예) {c.example}</p>
          </li>
        ))}
      </ul>
      <Button onClick={onClose}>확인했어요</Button>
    </BottomSheet>
  );
}
