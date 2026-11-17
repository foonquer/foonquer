import { useCallback, useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  createMapaeReport,
  MAPAE_EVENT_TYPES,
  MAPAE_REPORT_POINT,
  MAPAE_REPORT_RADIUS_M,
  type MapaeEventType,
} from '../../api/mapae';
import { getRestaurant, type RestaurantDetail } from '../../api/restaurants';
import { IMAGE_ACCEPT, uploadImage } from '../../api/uploads';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDistance } from '../../lib/format';
import { metersBetween } from '../../lib/geo';
import { getPreciseCoords, type Coords } from '../../lib/geolocation';
import { useAsync } from '../../lib/useAsync';
import { useCamera } from '../../lib/useCamera';
import styles from './Mapae.module.css';

/** 안내 문구 최대 길이 (서버 MAPAE-01과 같다) */
const MEMO_MAX = 200;

type Place =
  | { kind: 'checking' }
  | { kind: 'ok'; coords: Coords; distanceM: number }
  | { kind: 'far'; distanceM: number }
  | { kind: 'error'; denied: boolean };

type Photo = { file: File; url: string; today: boolean };

/** KST 날짜 (YYYY-MM-DD) */
const kstDate = (ms: number) => new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * 리뷰 이벤트(마패) 제보 /restaurants/:restaurantId/mapae-report (피그마 ⑥).
 * 가게에서 앱 카메라로 안내문을 찍고, 위치·오늘 찍은 사진·방문 기록을 자동으로 확인한 뒤 이벤트 종류를 골라 보낸다
 */
export function MapaeReportPage() {
  const restaurantId = Number(useParams().restaurantId);
  const { data, error, reload } = useAsync(() => getRestaurant(restaurantId), [restaurantId]);
  if (error) {
    return (
      <Screen>
        <AppHeader title="리뷰 이벤트 제보" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="리뷰 이벤트 제보" />
        <Loading />
      </Screen>
    );
  }
  return <ReportForm restaurant={data} />;
}

function ReportForm({ restaurant: r }: { restaurant: RestaurantDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const memoId = useId();
  const { video, state: cam, start, stop, resume, capture } = useCamera();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [place, setPlace] = useState<Place>({ kind: 'checking' });
  const [eventType, setEventType] = useState<MapaeEventType | null>(null);
  const [memo, setMemo] = useState('');
  const [sending, setSending] = useState(false);
  const hasVisit = r.my.conquestState === 'CONQUERED' || r.my.conqueredInPastSeason;

  /** 지금 위치를 재서 가게와의 거리를 본다 (가게 근처에서만 제보할 수 있다) */
  const measure = useCallback(() => {
    getPreciseCoords().then(
      (c) => {
        const distanceM = Math.round(metersBetween(c, { lat: r.lat, lng: r.lng }));
        setPlace(
          distanceM <= MAPAE_REPORT_RADIUS_M
            ? { kind: 'ok', coords: { lat: c.lat, lng: c.lng }, distanceM }
            : { kind: 'far', distanceM },
        );
      },
      (err: unknown) => setPlace({ kind: 'error', denied: err === 'DENIED' }),
    );
  }, [r.lat, r.lng]);
  const locate = () => {
    setPlace({ kind: 'checking' });
    measure();
  };
  // 들어오자마자 잰다
  useEffect(measure, [measure]);

  // 찍은 사진 미리보기 주소는 바뀌거나 화면을 떠나면 놓아 준다
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  const take = (file: File | null | undefined) => {
    if (!file) return;
    stop();
    setPhoto({
      file,
      url: URL.createObjectURL(file),
      today: kstDate(file.lastModified) === kstDate(Date.now()),
    });
  };
  const shoot = async () => {
    const file = await capture();
    if (file) take(file);
    else toast('사진을 찍지 못했어요. 다시 찍어 주세요');
  };
  const retake = () => {
    setPhoto(null);
    resume();
  };

  const ready = photo?.today && place.kind === 'ok' && eventType !== null;
  const send = async () => {
    if (!ready || !photo || place.kind !== 'ok' || !eventType) return;
    setSending(true);
    try {
      const photoKey = await uploadImage(photo.file, 'MAPAE');
      const report = await createMapaeReport(r.restaurantId, {
        eventType,
        memo: memo.trim() || null,
        photoKey,
        lat: place.coords.lat,
        lng: place.coords.lng,
      });
      navigate(`/mapae-reports/${report.reportId}`, { replace: true, state: { report } });
    } catch (err) {
      toast(errorMessage(err));
      setSending(false);
    }
  };

  return (
    <Screen
      footer={
        <Button onClick={send} disabled={!ready || sending}>
          {sending ? '보내는 중…' : '제보하기'}
        </Button>
      }
    >
      <AppHeader title="리뷰 이벤트 제보" />
      <div className={styles.content}>
        <div>
          <h2 className={styles.title}>{r.name}에서 본 리뷰 이벤트를 알려 주세요</h2>
          <p className={styles.sub}>
            가게에 붙은 안내문을 앱 카메라로 찍어 주세요. 서로 다른 방문자 제보가 2건 모이면 가게에
            마패가 붙어요.
          </p>
        </div>

        <section className={styles.camera} aria-label="안내문 사진">
          {photo ? (
            <>
              <img src={photo.url} alt="찍은 안내문 사진" className={styles.shot} />
              <button type="button" className={styles.retake} onClick={retake}>
                다시 찍기
              </button>
            </>
          ) : cam === 'live' || cam === 'starting' || cam === 'checking' ? (
            <>
              <video
                ref={video}
                className={styles.video}
                autoPlay
                muted
                playsInline
                aria-label="카메라 화면"
              />
              <button
                type="button"
                className={styles.shutter}
                aria-label="찍기"
                disabled={cam !== 'live'}
                onClick={shoot}
              />
            </>
          ) : cam === 'ask' || cam === 'paused' ? (
            <button type="button" className={styles.cameraStart} onClick={() => void start()}>
              카메라 켜기
            </button>
          ) : (
            <label className={styles.cameraStart}>
              {cam === 'blocked' ? '카메라가 막혀 있어요 · 휴대폰 카메라로 찍기' : '카메라로 찍기'}
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                capture="environment"
                hidden
                data-testid="mapae-photo-input"
                onChange={(e) => {
                  take(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </section>

        <section className={styles.card} aria-label="자동 확인">
          <h3 className={styles.cardTitle}>자동 확인</h3>
          <ul className={styles.checks}>
            <li data-state={place.kind === 'ok' ? 'ok' : place.kind === 'checking' ? 'wait' : 'no'}>
              <span className={styles.checkName}>가게 위치와 일치</span>
              <span className={styles.checkValue}>
                {place.kind === 'checking' && '위치 확인 중…'}
                {place.kind === 'ok' && `가게에서 ${formatDistance(place.distanceM)}`}
                {place.kind === 'far' &&
                  `가게에서 ${formatDistance(place.distanceM)} · ${MAPAE_REPORT_RADIUS_M}m 안에서 제보해 주세요`}
                {place.kind === 'error' &&
                  (place.denied ? '위치 권한이 꺼져 있어요' : '위치를 찾지 못했어요')}
                {(place.kind === 'far' || place.kind === 'error') && (
                  <button type="button" className={styles.again} onClick={locate}>
                    다시 확인
                  </button>
                )}
              </span>
            </li>
            <li data-state={!photo ? 'wait' : photo.today ? 'ok' : 'no'}>
              <span className={styles.checkName}>오늘 찍은 사진</span>
              <span className={styles.checkValue}>
                {!photo
                  ? '사진을 찍으면 확인돼요'
                  : photo.today
                    ? '오늘 찍은 사진이에요'
                    : '오늘 찍은 사진이 아니에요 · 다시 찍어 주세요'}
              </span>
            </li>
            <li data-state={hasVisit ? 'ok' : 'info'}>
              <span className={styles.checkName}>방문 기록</span>
              <span className={styles.checkValue}>
                {hasVisit ? '방문 인증 기록이 있어요' : '방문 기록이 없어도 제보할 수 있어요'}
              </span>
            </li>
          </ul>
        </section>

        <fieldset className={styles.types}>
          <legend className={styles.cardTitle}>어떤 이벤트였나요?</legend>
          <div className={styles.chips}>
            {MAPAE_EVENT_TYPES.map((t) => (
              <label key={t.value} className={styles.chip} data-on={eventType === t.value}>
                <input
                  type="radio"
                  name="eventType"
                  value={t.value}
                  checked={eventType === t.value}
                  onChange={() => setEventType(t.value)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={memoId} className={styles.cardTitle}>
            안내 문구 (선택)
          </label>
          <textarea
            id={memoId}
            className={styles.textarea}
            placeholder="예: 별점 5점 리뷰를 보여 주면 음료 서비스"
            maxLength={MEMO_MAX}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
        <p className={styles.note}>마패가 확정되면 제보자에게 +{MAPAE_REPORT_POINT}P를 드려요</p>
      </div>
    </Screen>
  );
}
