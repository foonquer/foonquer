import { Link } from 'react-router';
import { getCollection, getMyMukkaebi } from '../../api/mukkaebi';
import { AppHeader } from '../../components/AppHeader';
import { MukkaebiFigure } from '../../components/MukkaebiFigure';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatPoint, joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { wearingOf } from '../../lib/wearing';
import styles from './Mukkaebi.module.css';

async function load() {
  const [m, collection] = await Promise.all([getMyMukkaebi(), getCollection()]);
  return { m, stages: collection.stages };
}

/** 내 먹깨비 /me/mukkaebi (CHAR-01) — 레벨·성장 단계·착용·먹포인트, 꾸미기·상점·도감 */
export function MukkaebiPage() {
  const { data, error, reload } = useAsync(load, []);
  if (error) {
    return (
      <Screen>
        <AppHeader title="내 먹깨비" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="내 먹깨비" />
        <Loading />
      </Screen>
    );
  }

  const { m, stages } = data;
  const wearing = wearingOf(m);
  const worn = joinDot(Object.values(wearing).map((w) => w?.name));
  const next = stages.find((s) => !s.reached && s.fromLevel !== null);
  return (
    <Screen>
      <AppHeader
        title="내 먹깨비"
        right={
          <Link
            to="/me/points"
            className={styles.point}
            aria-label={`내 먹포인트 ${m.pointBalance}`}
          >
            <span aria-hidden="true">P</span>
            {m.pointBalance.toLocaleString('ko-KR')}
          </Link>
        }
      />
      <div className={styles.content}>
        <div className={styles.hero}>
          <MukkaebiFigure
            wearing={wearing}
            sizePercent={m.sizePercent}
            background={m.background?.sigunguName}
            badge={`LV.${m.level} ${m.stageName} 먹깨비`}
            height={290}
          />
          <p className={styles.bubble}>배고파… 새 맛집 가자!</p>
        </div>
        <p className={styles.caption}>{worn ? `착용 중 · ${worn}` : '아직 꾸미지 않았어요'}</p>

        {m.unopenedBoxCount > 0 && (
          <Link to="/me/mukkaebi/boxes" className={styles.box}>
            <span className={styles.boxText}>열지 않은 아이템 상자 {m.unopenedBoxCount}개</span>
            <span aria-hidden="true">›</span>
          </Link>
        )}

        <section className={styles.card} aria-label="성장 단계">
          <p className={styles.cardHead}>
            <strong>성장 단계</strong>
            <span>
              {next?.fromLevel
                ? `${next.name}까지 ${next.fromLevel - m.level}레벨 남았어요`
                : '다 자랐어요'}
            </span>
          </p>
          <ol className={styles.stages}>
            {stages.map((s) => (
              <li key={s.stage} data-reached={s.reached} data-current={s.isCurrent}>
                <span className={styles.stageDot} aria-hidden="true" />
                {joinDot([s.name, s.fromLevel !== null && `LV.${s.fromLevel}`])}
              </li>
            ))}
          </ol>
          {m.nextLevelExp !== null && (
            <p className={styles.exp}>
              경험치 {m.exp - m.levelExp} / {m.nextLevelExp - m.levelExp} · 다음 레벨까지{' '}
              {m.nextLevelExp - m.exp}
            </p>
          )}
        </section>

        <Link to="/me/points" className={styles.points}>
          <span className={styles.pointsLabel}>내 먹포인트</span>
          <span className={styles.pointsValue}>{formatPoint(m.pointBalance)}</span>
          <span className={styles.pointsChips}>
            <span>방문 인증 +50</span>
            <span>글 리뷰 +30</span>
            <span>사진 +20</span>
            <span>도움돼요 +5</span>
          </span>
          <span className={styles.pointsLink}>리뷰 쓰고 먹깨비를 꾸며보세요 ›</span>
        </Link>

        <nav className={styles.menu} aria-label="먹깨비 메뉴">
          <Link to="/me/mukkaebi/shop">상점</Link>
          <Link to="/me/mukkaebi/decorate" data-primary="true">
            꾸미기
            {m.newItemCount > 0 && <span className={styles.new}>NEW {m.newItemCount}</span>}
          </Link>
          <Link to="/me/mukkaebi/collection">도감</Link>
        </nav>
      </div>
    </Screen>
  );
}
