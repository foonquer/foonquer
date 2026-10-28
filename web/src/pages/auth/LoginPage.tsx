import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { oauthStartUrl, type Provider } from '../../api/auth';
import google from '../../assets/icons/google.svg';
import kakao from '../../assets/icons/kakao.svg';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import pinConquered from '../../assets/illust/pin-conquered.svg';
import pinUnconquered from '../../assets/illust/pin-unconquered.svg';
import { useToast } from '../../components/Toast';
import styles from './LoginPage.module.css';

// Figma S-03 소개 카드의 흐린 핀 (left, top, 배율, 불투명도)
const PINS = [
  { src: pinConquered, left: 30, top: 40, scale: 0.7, opacity: 0.35 },
  { src: pinUnconquered, left: 270, top: 30, scale: 0.65, opacity: 0.3 },
  { src: pinConquered, left: 290, top: 190, scale: 0.7, opacity: 0.3 },
  { src: pinUnconquered, left: 20, top: 210, scale: 0.6, opacity: 0.25 },
  { src: pinUnconquered, left: 114, top: 249, scale: 0.75, opacity: 0.25 },
];

/** 소셜 로그인 시작 (서버가 카카오·구글 로그인 화면으로 보낸다) */
function startOAuth(provider: Provider) {
  window.location.assign(oauthStartUrl(provider));
}

/** S-03 로그인 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const from = (location.state as { from?: unknown } | null)?.from;
  const notice = (location.state as { notice?: string } | null)?.notice;

  // 소셜 로그인 실패 등 이전 화면이 남긴 안내
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
            style={{ left: pin.left, top: pin.top, width: 49 * pin.scale, opacity: pin.opacity }}
          />
        ))}
        <h1 className={styles.logo}>먹장깨기</h1>
        <p className={styles.tagline}>우리 동네 맛집 정복 게임</p>
        <img src={mukkaebi} alt="" className={styles.mukkaebi} />
      </section>

      <div className={styles.buttons}>
        <button type="button" className={styles.kakao} onClick={() => startOAuth('kakao')}>
          <img src={kakao} alt="" width={20} height={20} />
          카카오로 시작하기
        </button>
        <button type="button" className={styles.google} onClick={() => startOAuth('google')}>
          <img src={google} alt="" width={20} height={20} />
          Google로 시작하기
        </button>
        <button
          type="button"
          className={styles.email}
          onClick={() => navigate('/signup/email', { state: { from } })}
        >
          이메일로 시작하기
        </button>
      </div>

      <p className={styles.loginLink}>
        이미 계정이 있나요?
        <Link to="/login/email" state={{ from }}>
          이메일로 로그인
        </Link>
      </p>
    </main>
  );
}
