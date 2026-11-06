import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getMemberProfile } from '../../api/profile';
import { getSeasonRecords } from '../../api/ranking';
import { getMe } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import {
  CARD_THEMES,
  type CardData,
  type CardTheme,
  cardPng,
  cardSvg,
  svgDataUrl,
} from '../../lib/mukjjangCard';
import { useAsync } from '../../lib/useAsync';
import styles from './MukjjangCard.module.css';

/** 이번 시즌에 먹짱이면 이번 시즌, 아니면 가장 최근에 먹짱이었던 지난 시즌 (먹짱이었던 적이 없으면 null) */
async function loadCard(): Promise<{ card: CardData; userId: number } | null> {
  const [me, records] = await Promise.all([getMe(), getSeasonRecords()]);
  const current = records.current;
  const now =
    current?.best?.tier === 'MUKJJANG'
      ? {
          seasonNo: current.season.seasonNo,
          sigunguName: current.best.sigunguName,
          conquestCount: current.conquestCount,
        }
      : null;
  const past = records.records.find((r) => r.tier === 'MUKJJANG');
  const season =
    now ??
    (past && {
      seasonNo: past.season.seasonNo,
      sigunguName: past.bestSigunguName,
      conquestCount: past.conquestTotal,
    });
  if (!season) return null;
  const profile = await getMemberProfile(me.id);
  return {
    userId: me.id,
    card: {
      ...season,
      nickname: profile.nickname ?? me.nickname ?? '탐험가',
      trustTemp: profile.trustTemp,
      picks: profile.picks.slice(0, 3),
      url: `${window.location.origin}/users/${me.id}?tab=pick`,
    },
  };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 먹짱 카드 공유 /me/mukjjang-card (피그마 696:9615) — 테마를 골라 이미지로 저장·공유, 링크 복사 */
export function MukjjangCardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, reload } = useAsync(loadCard, []);
  const [theme, setTheme] = useState<CardTheme>('NAVY');
  const [busy, setBusy] = useState(false);
  const svg = useMemo(() => (data ? cardSvg(data.card, theme) : ''), [data, theme]);
  const close = () => navigate(-1);

  if (error || data === undefined || data === null) {
    return (
      <Screen>
        <AppHeader title="먹짱 카드 공유" onBack={close} />
        {error ? (
          <EmptyState title={errorMessage(error)} onRetry={reload} />
        ) : data === null ? (
          <EmptyState
            title="구 먹짱이 되면 만들 수 있어요"
            description="한 구에서 이번 시즌 1위가 되면 자랑할 수 있는 카드를 만들 수 있어요."
          />
        ) : (
          <Loading />
        )}
      </Screen>
    );
  }

  const { card } = data;
  const fileName = `먹짱카드-${card.sigunguName}-시즌${card.seasonNo}.png`;
  const withImage = async (then: (file: File) => Promise<void>) => {
    setBusy(true);
    try {
      const blob = await cardPng(svg);
      await then(new File([blob], fileName, { type: 'image/png' }));
    } catch (err) {
      // 공유 창을 닫은 것은 실패가 아니다
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast('이미지를 만들지 못했어요. 다시 시도해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    withImage(async (file) => {
      download(file, fileName);
      toast({ message: '카드 이미지를 저장했어요', check: true });
    });

  // 휴대폰이면 공유 창에서 인스타그램을 고른다. 파일 공유를 못 하는 브라우저는 저장으로
  const story = () =>
    withImage(async (file) => {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${card.sigunguName} 먹짱` });
        return;
      }
      download(file, fileName);
      toast('이미지를 저장했어요. 인스타그램 스토리에서 올려 보세요');
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(card.url);
      toast({ message: '내 PICK 링크를 복사했어요', check: true });
    } catch {
      toast('링크를 복사하지 못했어요');
    }
  };

  return (
    <Screen>
      <AppHeader title="먹짱 카드 공유" onBack={close} />
      <div className={styles.content}>
        <img
          className={styles.card}
          src={svgDataUrl(svg)}
          alt={`시즌 ${card.seasonNo} ${card.sigunguName} 먹짱 ${card.nickname} 카드`}
        />
        <div className={styles.themes} role="radiogroup" aria-label="테마">
          <span aria-hidden="true">테마</span>
          {(Object.keys(CARD_THEMES) as CardTheme[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === theme}
              aria-label={CARD_THEMES[t].name}
              className={styles.swatch}
              style={{ background: CARD_THEMES[t].bg }}
              onClick={() => setTheme(t)}
            />
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={story} disabled={busy} data-tone="coral">
            <span aria-hidden="true">↗</span>
            인스타 스토리
          </button>
          <button type="button" onClick={save} disabled={busy} data-tone="forest">
            <span aria-hidden="true">↓</span>
            이미지 저장
          </button>
          <button type="button" onClick={copyLink} data-tone="green">
            <span aria-hidden="true">⧉</span>
            링크 복사
          </button>
        </div>
        <p className={styles.note}>
          카드에는 먹장깨기 QR이 함께 들어가서, 보는 사람이 바로 앱으로 들어올 수 있어요.
        </p>
      </div>
    </Screen>
  );
}
