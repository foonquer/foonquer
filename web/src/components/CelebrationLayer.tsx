import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { type Celebration, getCelebrations, markCelebrationSeen } from '../api/mukkaebi';
import mukkaebi from '../assets/illust/mukkaebi.svg';
import { useModalFocus } from '../lib/a11y';
import { backgroundArt } from '../lib/backgroundArt';
import { formatPoint } from '../lib/format';
import { euro, iGa } from '../lib/korean';
import { subscribeSession } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { Button } from './Button';
import styles from './CelebrationLayer.module.css';

type Copy = {
  label: string;
  title: string;
  sub: string;
  reward?: string;
  action: string;
  to: string;
};

function copyOf(c: Celebration): Copy {
  switch (c.type) {
    case 'LEVEL_UP':
      return {
        label: 'LEVEL UP',
        title: `LV.${c.data.fromLevel} → LV.${c.data.toLevel}`,
        sub: `먹깨비가 ${euro(c.data.stageName)} 자랐어요!`,
        reward:
          c.data.itemBoxCount > 0 ? `성장 보상 · 아이템 상자 ${c.data.itemBoxCount}개` : undefined,
        action: c.data.itemBoxCount > 0 ? '상자 열러 가기' : '꾸미러 가기',
        to: c.data.itemBoxCount > 0 ? '/me/mukkaebi/boxes' : '/me/mukkaebi/decorate',
      };
    case 'TIER_UP':
      return {
        label: 'TIER UP',
        title: `${iGa(c.data.tierTitle)} 됐어요!`,
        sub: c.data.rank ? `지금 ${c.data.sigunguName} ${c.data.rank}위예요` : '계속 정복해 보세요',
        action: '순위 보러 가기',
        to: `/ranking?sigunguId=${c.data.sigunguId}`,
      };
    case 'BACKGROUND':
      return {
        label: 'NEW BACKGROUND',
        title: `${c.data.sigunguName} 배경을 얻었어요!`,
        sub: '한 구에서 서로 다른 가게 10곳을 정복했어요',
        action: '배경 바꾸러 가기',
        to: '/me/mukkaebi/decorate?tab=BACKGROUND',
      };
    case 'ACHIEVEMENT':
      return {
        label: 'ACHIEVEMENT',
        title: `업적 달성 · ${c.data.name}`,
        sub: c.data.description ?? '',
        reward: c.data.rewardPoint > 0 ? `+${formatPoint(c.data.rewardPoint)}` : undefined,
        action: '칭호 보러 가기',
        to: '/me/seasons',
      };
    case 'SEASON_RESULT':
      return {
        label: `SEASON ${c.data.seasonNo} RESULT`,
        title: `시즌 ${c.data.seasonNo} 결과 · ${c.data.tierTitle}`,
        sub: `${c.data.rank ? `${c.data.rank}위 · ` : ''}${c.data.conquestTotal}곳 정복`,
        reward:
          [
            c.data.rewardPoint > 0 ? `+${formatPoint(c.data.rewardPoint)}` : null,
            c.data.rewardClubItem?.name,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        action: '시즌 기록 보기',
        to: '/me/seasons',
      };
  }
}

/**
 * 닫은 축하. 탭을 옮겨 새로 부른 목록이 확인 기록보다 먼저 와도 다시 띄우지 않는다.
 * 확인 기록이 실패하면 빼서 다음에 부를 때 다시 띄운다.
 * 로그인·토큰 재발급·로그아웃 때 비운다 (다른 탭에서 다른 계정으로 바꿨으면 그 계정의 같은 축하 id를 숨기지 않게)
 */
const closedIds = new Set<string>();
subscribeSession(() => closedIds.clear());

/** 아직 보지 않은 축하(레벨 업·티어 상승·배경·업적·시즌 결과)를 하나씩 띄운다 (CHAR-08·09) */
export function CelebrationLayer() {
  const navigate = useNavigate();
  const { data } = useAsync(getCelebrations, []);
  // 이 화면에서 닫은 것 (확인 기록이 실패해도 이 화면에서는 다시 띄우지 않는다)
  const [skipped, setSkipped] = useState<string[]>([]);
  const box = useRef<HTMLElement>(null);
  const current = data?.items.find(
    (c) => !skipped.includes(c.celebrationId) && !closedIds.has(c.celebrationId),
  );
  useModalFocus(Boolean(current), box);

  if (!current) return null;
  const copy = copyOf(current);
  // 배경을 얻었으면 먹깨비 대신 그 구 배경 그림
  const bgArt = current.type === 'BACKGROUND' ? backgroundArt(current.data.bgKey) : undefined;
  const close = (to?: string) => {
    const id = current.celebrationId;
    // 확인 기록이 실패해도 화면은 넘긴다 (다음에 다시 뜬다)
    closedIds.add(id);
    void markCelebrationSeen(id).catch(() => closedIds.delete(id));
    setSkipped((s) => [...s, id]);
    if (to) navigate(to);
  };

  return createPortal(
    <div className={styles.layer}>
      <section
        ref={box}
        tabIndex={-1}
        className={styles.box}
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        // 포커스는 상자 안에 있으니 여기서 Escape를 받는다 ("나중에 할게요"와 같다)
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <p className={styles.label}>{copy.label}</p>
        <h2 className={styles.title}>{copy.title}</h2>
        <p className={styles.sub}>{copy.sub}</p>
        {bgArt ? (
          <img src={bgArt} alt="" className={styles.bgArt} />
        ) : (
          <img src={mukkaebi} alt="" className={styles.mukkaebi} />
        )}
        {copy.reward && <p className={styles.reward}>{copy.reward}</p>}
        <div className={styles.buttons}>
          <Button onClick={() => close(copy.to)}>{copy.action}</Button>
          <Button variant="plain" onClick={() => close()}>
            나중에 할게요
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
