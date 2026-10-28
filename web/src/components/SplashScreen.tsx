import mukkaebi from '../assets/illust/mukkaebi.svg';
import pinConquered from '../assets/illust/pin-conquered.svg';
import pinUnconquered from '../assets/illust/pin-unconquered.svg';
import styles from './SplashScreen.module.css';

// Figma S-01: 흐릿한 음식점 핀 6개 (left, top, 크기 배율, 불투명도)
const PINS = [
  { src: pinConquered, left: 40, top: 120, scale: 0.8, opacity: 0.35 },
  { src: pinUnconquered, left: 300, top: 90, scale: 0.7, opacity: 0.3 },
  { src: pinConquered, left: 250, top: 260, scale: 0.9, opacity: 0.25 },
  { src: pinUnconquered, left: 30, top: 330, scale: 0.75, opacity: 0.25 },
  { src: pinUnconquered, left: 123, top: 527, scale: 0.75, opacity: 0.25 },
  { src: pinConquered, left: 320, top: 420, scale: 0.8, opacity: 0.3 },
];

/** S-01 스플래시. 앱을 열어 로그인 상태를 확인하는 동안 보여 준다 */
export function SplashScreen() {
  return (
    <div className={styles.splash} role="status" aria-label="먹장깨기를 여는 중">
      <div className={styles.canvas}>
        {PINS.map((pin, i) => (
          <img
            key={i}
            src={pin.src}
            alt=""
            className={styles.pin}
            style={{
              left: pin.left,
              top: `${(pin.top / 844) * 100}%`,
              width: 49 * pin.scale,
              opacity: pin.opacity,
            }}
          />
        ))}
        <div className={styles.title}>
          <p className={styles.logo}>먹장깨기</p>
          <p className={styles.tagline}>우리 동네 맛집 정복 게임</p>
        </div>
        <img src={mukkaebi} alt="" className={styles.mukkaebi} />
      </div>
    </div>
  );
}
