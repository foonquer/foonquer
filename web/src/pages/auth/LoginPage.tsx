import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { kakaoLoginUrl } from '../../api/auth';
import kakao from '../../assets/icons/kakao.svg';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import pinConquered from '../../assets/illust/pin-conquered.svg';
import pinUnconquered from '../../assets/illust/pin-unconquered.svg';
import { useToast } from '../../components/Toast';
import styles from './LoginPage.module.css';

// Figma S-03 소개 카드의 흐린 핀 (left, top 또는 bottom, 배율, 불투명도).
// 먹깨비 머리 위 핀은 먹깨비처럼 카드 아래를 기준으로 둔다.
const PINS = [
  { src: pinConquered, left: 30, top: 56, scale: 0.7, opacity: 0.35 },
  { src: pinUnconquered, left: 270, top: 44, scale: 0.65, opacity: 0.3 },
  { src: pinConquered, left: 290, top: 260, scale: 0.7, opacity: 0.3 },
  { src: pinUnconquered, left: 24, top: 300, scale: 0.6, opacity: 0.25 },
  { src: pinUnconquered, left: 114, bottom: 166, scale: 0.75, opacity: 0.25 },
];

/** 카카오 로그인 시작 (서버가 카카오 로그인 화면으로 보낸다) */
function startKakaoLogin() {
  window.location.assign(kakaoLoginUrl);
}

/** S-03 로그인 (로그인은 카카오 하나만) */
export function LoginPage() {
  const location = useLocation();
  const toast = useToast();
  const notice = (location.state as { notice?: string } | null)?.notice;

  // 카카오 로그인 실패 등 이전 화면이 남긴 안내
  useEffect(() => {
    if (notice) toast(notice);
  }, [notice, toast]);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-label="먹장깨기 소개">
        {PINS.map((pin, i) => (
          <img
            key={i}
            src={pin.src}
            alt=""
            className={styles.pin}
            style={{
              left: pin.left,
              top: pin.top,
              bottom: pin.bottom,
              width: 49 * pin.scale,
              opacity: pin.opacity,
            }}
          />
        ))}
        <h1 className={styles.logo}>먹장깨기</h1>
        <p className={styles.tagline}>우리 동네 맛집 정복 게임</p>
        <img src={mukkaebi} alt="" className={styles.mukkaebi} />
      </section>

      <div className={styles.buttons}>
        <button type="button" className={styles.kakao} onClick={startKakaoLogin}>
          <img src={kakao} alt="" width={20} height={20} />
          카카오로 시작하기
        </button>
      </div>
    </main>
  );
}
