import { useRef, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router';
import onboarding1 from '../../assets/illust/onboarding-1.svg';
import onboarding2 from '../../assets/illust/onboarding-2.svg';
import onboarding3 from '../../assets/illust/onboarding-3.svg';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { onboarding } from '../../lib/storage';
import styles from './OnboardingPage.module.css';

const SLIDES = [
  {
    image: onboarding1,
    title: '동네 맛집을\n하나씩 정복해요',
    body: '가 보고 싶은 곳을 저장하고, 다녀온 맛집은\n지도 위에 정복 깃발로 남아요.',
  },
  {
    image: onboarding2,
    title: '영수증이나 현장 사진으로\n방문을 인증해요',
    body: '영수증을 찍거나, 가게 근처에서 음식 사진을 올려요.\n별점까지 남기면 정복이 완료돼요.',
  },
  {
    image: onboarding3,
    title: '우리 동네 먹짱에\n도전해요',
    body: '정복할수록 티어가 올라가요.\n시즌 1위는 그 구의 먹짱이 돼요.',
  },
];

/** 옆으로 이만큼 밀면 다음·이전 장으로 넘긴다 (px) */
const SWIPE_PX = 40;

/** S-02 온보딩. 처음 한 번만 보여 주고 로그인으로 보낸다 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const last = index === SLIDES.length - 1;

  const finish = () => {
    onboarding.markSeen();
    navigate('/login', { replace: true });
  };

  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (dx < -SWIPE_PX) setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
    if (dx > SWIPE_PX) setIndex((i) => Math.max(i - 1, 0));
  };

  return (
    <Screen
      footer={
        <Button onClick={last ? finish : () => setIndex(index + 1)}>
          {last ? '시작하기' : '다음'}
        </Button>
      }
    >
      <div className={styles.top}>
        <button type="button" className={styles.skip} onClick={finish}>
          건너뛰기
        </button>
      </div>
      <div
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        aria-roledescription="carousel"
      >
        <div className={styles.track} style={{ transform: `translateX(-${index * 100}%)` }}>
          {SLIDES.map((slide, i) => (
            <section
              key={slide.title}
              className={styles.slide}
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${SLIDES.length}`}
              aria-hidden={i !== index}
            >
              <img src={slide.image} alt="" className={styles.card} draggable={false} />
              <div className={styles.dots} aria-hidden="true">
                {SLIDES.map((s, d) => (
                  <span key={s.title} className={styles.dot} data-active={d === i} />
                ))}
              </div>
              <h2 className={styles.title}>{slide.title}</h2>
              <p className={styles.body}>{slide.body}</p>
            </section>
          ))}
        </div>
      </div>
    </Screen>
  );
}
