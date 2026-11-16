import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { getMyMukkaebi, type MyMukkaebi } from '../../api/mukkaebi';
import { getVerification, type Verification } from '../../api/visits';
import pinConquered from '../../assets/illust/pin-conquered.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { MukkaebiBody } from '../../components/MukkaebiFigure';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatDate, formatWon } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { wearingOf } from '../../lib/wearing';
import flow from './Flow.module.css';
import styles from './Journey.module.css';
import { buildRoute, type Decor, type Route } from './journey';

/** 먹깨비가 출발해서 가게에 도착할 때까지 (ms) */
const WALK_MS = 3800;
/** 걷는 먹깨비 그림 너비 (px) */
const WALKER_W = 58;
/** 길 위에 비워 두는 높이: 제목 + 도착 가게 그림 */
const TOP_ROOM = 290;
/** 길 아래에 비워 두는 높이: 출발 표시 */
const BOTTOM_ROOM = 150;

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 천천히 출발해서 천천히 멈춘다 */
const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/**
 * 먹깨비 따라가기 /visits/:visitId/follow — 인증을 마치면(현장·영수증) 전체 화면에서
 * 먹깨비가 마지막으로 정복한 가게에서 꼬불꼬불 길을 따라 인증한 가게까지 걸어가고, 도착하면 아래에 버튼이 나온다
 */
export function FollowPage() {
  const visitId = Number(useParams().visitId);
  const { data, error, reload } = useAsync(
    () => Promise.all([getVerification(visitId), getMyMukkaebi().catch(() => null)]),
    [visitId],
  );

  if (error) {
    return (
      <Screen>
        <AppHeader title="먹깨비 따라가기" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="먹깨비 따라가기" />
        <Loading />
      </Screen>
    );
  }
  const [v, mukkaebi] = data;
  // 이미 정복했거나 아직 인증 전이면 결과 화면이 알맞은 곳으로 보낸다
  if (v.status !== 'VERIFIED') return <Navigate to={`/visits/${visitId}`} replace />;
  return <Journey v={v} mukkaebi={mukkaebi} />;
}

/** 화면 크기 (바뀌면 길을 다시 그린다). 잴 수 없으면 휴대폰 크기 */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 390, height: 800 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0)
        setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function Journey({ v, mukkaebi }: { v: Verification; mukkaebi: MyMukkaebi | null }) {
  const navigate = useNavigate();
  const scene = useRef<HTMLDivElement>(null);
  const walker = useRef<HTMLDivElement>(null);
  const facing = useRef<HTMLDivElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const { width, height } = useBoxSize(scene);
  const route = useMemo(() => buildRoute(width, height, TOP_ROOM, BOTTOM_ROOM), [width, height]);
  const routeRef = useRef(route);
  const [arrived, setArrived] = useState(
    () => reducedMotion() || typeof requestAnimationFrame !== 'function',
  );

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // 걷는 동안은 매 프레임 위치만 바꾼다 (다시 그리지 않는다)
  useEffect(() => {
    if (arrived) return;
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / WALK_MS);
      const r = routeRef.current;
      const p = r.at(ease(t));
      if (walker.current) walker.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
      if (facing.current) facing.current.style.transform = p.dx < -0.01 ? 'scaleX(-1)' : '';
      if (trail.current) trail.current.style.strokeDasharray = `${ease(t) * r.length} ${r.length}`;
      if (t < 1) frame = requestAnimationFrame(step);
      else setArrived(true);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [arrived]);

  const name = v.restaurant?.name ?? '가게';
  const prev =
    mukkaebi?.currentRestaurant &&
    mukkaebi.currentRestaurant.restaurantId !== v.restaurant?.restaurantId
      ? mukkaebi.currentRestaurant.name
      : null;
  const here = arrived ? route.end : route.start;
  const receipt = v.method === 'RECEIPT';

  return (
    <div className={styles.journey} data-arrived={arrived}>
      <div ref={scene} className={styles.scene} aria-hidden="true">
        <svg
          className={styles.map}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <ellipse
            cx={width * 0.18}
            cy={route.end.y + 34}
            rx={width * 0.62}
            ry={62}
            fill="#d2e7c4"
          />
          <ellipse cx={width * 0.9} cy={route.end.y + 24} rx={width * 0.5} ry={54} fill="#c8e0b9" />
          {route.decor.map((d, i) => (
            <DecorArt key={i} d={d} />
          ))}
          <path d={route.d} className={styles.roadEdge} transform="translate(0 4)" />
          <path d={route.d} className={styles.roadEdge} />
          <path d={route.d} className={styles.road} />
          <path d={route.d} className={styles.roadLine} />
          <path
            ref={trail}
            d={route.d}
            className={styles.trail}
            style={{ strokeDasharray: `${arrived ? route.length : 0} ${route.length}` }}
          />
          <Origin at={route.start} prev={prev} />
          <Shop at={route.end} name={name} maxWidth={width * 0.8} />
        </svg>
        <span className={styles.cloud} style={{ top: 70, left: '8%' }} />
        <span className={styles.cloud} data-size="s" style={{ top: 132, left: '64%' }} />
        <div
          ref={walker}
          className={styles.walker}
          style={{ transform: `translate(${here.x}px, ${here.y}px)` }}
        >
          <span className={styles.shadow} />
          <div ref={facing} className={styles.facing}>
            <div className={styles.bob}>
              <MukkaebiBody
                wearing={mukkaebi ? wearingOf(mukkaebi) : {}}
                stage={mukkaebi?.stage}
                width={WALKER_W}
              />
            </div>
          </div>
        </div>
        {arrived && (
          <div
            className={styles.sparkles}
            style={{ transform: `translate(${route.end.x}px, ${route.end.y - 70}px)` }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ '--turn': `${i * 45}deg` } as CSSProperties} />
            ))}
          </div>
        )}
      </div>

      <div className={styles.top}>
        <AppHeader />
        <div className={styles.heading}>
          <span className={styles.chip}>{receipt ? '영수증 인증 완료' : '현장 인증 완료'}</span>
          <h2 className={styles.title} aria-live="polite">
            {arrived ? `${name} 도착!` : `${name}까지 이동 중`}
          </h2>
          <p className={styles.subtitle}>
            {arrived
              ? '맛 별점을 남기면 정복이 완료돼요'
              : prev
                ? `${prev}에서 출발했어요`
                : '먹깨비가 첫 정복을 향해 출발했어요'}
          </p>
        </div>
      </div>

      {arrived && (
        <section className={styles.sheet} aria-label="인증한 가게">
          <p className={flow.cardName}>{name}</p>
          {v.restaurant?.categoryName && (
            <p className={flow.cardMeta}>{v.restaurant.categoryName}</p>
          )}
          <div className={flow.rows}>
            <p className={flow.row}>
              <span>방문 날짜</span>
              <strong>{formatDate(v.receipt?.paidAt ?? v.verifiedAt)}</strong>
            </p>
            {receipt && v.receipt?.totalAmount != null && (
              <p className={flow.row}>
                <span>결제 금액</span>
                <strong>{formatWon(v.receipt.totalAmount)}</strong>
              </p>
            )}
          </div>
          <Button onClick={() => navigate(`/visits/${v.verificationId}/rating`, { replace: true })}>
            별점 남기고 정복하기
          </Button>
        </section>
      )}
    </div>
  );
}

/** 출발 자리: 마지막으로 정복한 가게(정복 핀) 또는 처음이면 출발 깃발 */
function Origin({ at, prev }: { at: Route['start']; prev: string | null }) {
  const label = prev ? (prev.length > 10 ? `${prev.slice(0, 10)}…` : prev) : '출발';
  const w = Math.max(56, 26 + label.length * 12);
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <ellipse cx="0" cy="4" rx="22" ry="6" fill="rgba(47, 93, 61, 0.18)" />
      {/* 먹깨비가 서 있는 자리 옆에 둔다 */}
      {prev ? (
        <image href={pinConquered} x="-63" y="-40" width="34" height="40" />
      ) : (
        <g transform="translate(-40 0)">
          <rect x="-1.5" y="-38" width="3" height="40" rx="1.5" fill="#2f5d3d" />
          <path d="M1.5 -38 L24 -30 L1.5 -22 Z" fill="#ea7b66" />
        </g>
      )}
      <g transform="translate(0 30)">
        <rect x={-w / 2} y="-13" width={w} height="26" rx="13" fill="#ffffff" />
        <text className={styles.originText} textAnchor="middle" y="4.5">
          {label}
        </text>
      </g>
      {prev && (
        <text className={styles.originCaption} textAnchor="middle" y="58">
          지난 정복
        </text>
      )}
    </g>
  );
}

/** 도착 가게: 줄무늬 차양과 간판(가게 이름)이 있는 작은 가게. 아래 가운데가 길 끝 */
function Shop({ at, name, maxWidth }: { at: Route['end']; name: string; maxWidth: number }) {
  const label = name.length > 12 ? `${name.slice(0, 12)}…` : name;
  const signW = Math.min(maxWidth, Math.max(88, 28 + label.length * 14));
  /** 차양: 산호색·연분홍 줄 9칸 (양 끝은 산호색), 칸마다 같은 색 물결 */
  const seg = 124 / 9;
  const stripes = Array.from({ length: 9 }, (_, k) => ({
    x: -62 + seg * k,
    color: k % 2 === 0 ? '#ea7b66' : '#ffe1d8',
  }));
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <g className={styles.shop}>
        <ellipse cx="0" cy="2" rx="70" ry="9" fill="rgba(47, 93, 61, 0.16)" />
        <rect x="-56" y="-80" width="112" height="80" rx="8" fill="#fffaf0" stroke="#eadfc8" />
        <rect x="-46" y="-60" width="28" height="22" rx="4" fill="#d6ebf5" />
        <rect x="18" y="-60" width="28" height="22" rx="4" fill="#d6ebf5" />
        <rect x="-13" y="-42" width="26" height="42" rx="4" fill="#c08a5c" />
        <circle cx="7" cy="-20" r="2" fill="#fff1d9" />
        <rect x="-62" y="-94" width="124" height="20" rx="6" fill="#ea7b66" />
        {stripes.map(({ x, color }) => (
          <g key={x} fill={color}>
            {color !== '#ea7b66' && <rect x={x} y="-94" width={seg} height="20" />}
            <circle cx={x + seg / 2} cy="-74" r={seg / 2} />
          </g>
        ))}
        <rect x={-signW / 2} y="-124" width={signW} height="26" rx="9" fill="#2f5d3d" />
        <text className={styles.signText} textAnchor="middle" y="-106">
          {label}
        </text>
      </g>
    </g>
  );
}

function DecorArt({ d }: { d: Decor }) {
  const t = `translate(${d.x} ${d.y}) scale(${d.size})`;
  switch (d.kind) {
    case 'tree':
      return (
        <g transform={t}>
          <ellipse cx="0" cy="2" rx="16" ry="4" fill="rgba(47, 93, 61, 0.14)" />
          <rect x="-3" y="-16" width="6" height="18" rx="2" fill="#a97c55" />
          <circle cx="0" cy="-30" r="17" fill="#7cbf70" />
          <circle cx="-9" cy="-22" r="11" fill="#5ca867" />
          <circle cx="6" cy="-37" r="6" fill="#a7d89a" />
        </g>
      );
    case 'bush':
      return (
        <g transform={t}>
          <circle cx="-10" cy="-8" r="10" fill="#6db767" />
          <circle cx="6" cy="-11" r="13" fill="#7cbf70" />
          <circle cx="18" cy="-6" r="8" fill="#5ca867" />
        </g>
      );
    case 'house':
      return (
        <g transform={t}>
          <ellipse cx="0" cy="2" rx="26" ry="5" fill="rgba(47, 93, 61, 0.14)" />
          <rect x="-20" y="-26" width="40" height="28" rx="3" fill="#fff1d9" />
          <path d="M-26 -24 L0 -44 L26 -24 Z" fill="#2f5d3d" />
          <rect x="-5" y="-14" width="10" height="16" rx="2" fill="#c08a5c" />
          <rect x="9" y="-20" width="7" height="7" rx="1.5" fill="#d6ebf5" />
        </g>
      );
    case 'flower':
      return (
        <g transform={t}>
          <rect x="-0.75" y="-10" width="1.5" height="10" fill="#5ca867" />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle
              key={a}
              cx={Math.cos((a * Math.PI) / 180) * 4}
              cy={-12 + Math.sin((a * Math.PI) / 180) * 4}
              r="3"
              fill="#f2a38f"
            />
          ))}
          <circle cx="0" cy="-12" r="2.4" fill="#e9c46a" />
        </g>
      );
  }
}
