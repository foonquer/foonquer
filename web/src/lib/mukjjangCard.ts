// 먹짱 카드 (피그마 696:9615). 화면에 보여 주는 그림과 저장·공유하는 이미지를 같은 SVG 하나로 만든다.
// 저장 이미지는 9:16(인스타 스토리) 비율. 글꼴은 이미지 안에서 웹 글꼴을 못 써서 기기 기본 글꼴을 쓴다.

import qrcode from 'qrcode-generator';
import mukkaebi from '../assets/illust/mukkaebi.svg?raw';

export type CardTheme = 'NAVY' | 'CREAM' | 'GREEN';

type Palette = { name: string; bg: string; ink: string; sub: string; accent: string; soft: string };

export const CARD_THEMES: Record<CardTheme, Palette> = {
  NAVY: {
    name: '밤하늘',
    bg: '#272b5e',
    ink: '#ffffff',
    sub: '#c8cbec',
    accent: '#f5c84c',
    soft: 'rgba(255,255,255,0.12)',
  },
  CREAM: {
    name: '크림',
    bg: '#fdf1d6',
    ink: '#2c3a2d',
    sub: '#6f6a5c',
    accent: '#e08a3c',
    soft: 'rgba(44,58,45,0.08)',
  },
  GREEN: {
    name: '숲',
    bg: '#2f5e3b',
    ink: '#ffffff',
    sub: '#cfe5cf',
    accent: '#f5c84c',
    soft: 'rgba(255,255,255,0.12)',
  },
};

export type CardData = {
  seasonNo: number;
  sigunguName: string;
  nickname: string;
  conquestCount: number;
  trustTemp: number;
  /** PICK 위에서 3곳 */
  picks: { name: string; categoryName: string | null }[];
  /** QR로 여는 주소 (내 PICK) */
  url: string;
};

export const CARD_WIDTH = 720;
export const CARD_HEIGHT = 1280;

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** QR 칸을 path 하나로 (어두운 칸만) */
function qrPath(url: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  let d = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c)) d += `M${x + c * cell} ${y + r * cell}h${cell}v${cell}h${-cell}z`;
    }
  }
  return `<path d="${d}" fill="#242824" shape-rendering="crispEdges"/>`;
}

/** 먹깨비 그림을 카드 안 자리(x, y, 너비)에 넣는다 */
function mukkaebiAt(x: number, y: number, width: number) {
  return mukkaebi
    .replace(/<\?xml[^>]*>/, '')
    .replace(
      /<svg([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/,
      `<svg$1 x="${x}" y="${y}" width="${width}" height="${width * 1.07}"`,
    );
}

const text = (
  x: number,
  y: number,
  body: string,
  attrs: { size: number; fill: string; weight?: number; anchor?: 'start' | 'middle' | 'end' },
) =>
  `<text x="${x}" y="${y}" font-size="${attrs.size}" font-weight="${attrs.weight ?? 400}" fill="${attrs.fill}" text-anchor="${attrs.anchor ?? 'start'}">${escape(body)}</text>`;

/** 카드 SVG 글 (화면 표시·이미지 저장 공통) */
export function cardSvg(d: CardData, theme: CardTheme) {
  const t = CARD_THEMES[theme];
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const stars = [
    [96, 150, 3],
    [640, 120, 4],
    [600, 330, 3],
    [120, 420, 4],
    [660, 560, 3],
    [70, 640, 3],
  ]
    .map(
      ([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${t.accent}" opacity="0.7"/>`,
    )
    .join('');
  const picks =
    d.picks.length > 0
      ? d.picks
          .slice(0, 3)
          .map((p, i) => {
            const y = 920 + i * 58;
            return [
              text(80, y, String(i + 1), { size: 30, fill: t.accent, weight: 800 }),
              text(120, y, clip(p.name, 12), { size: 30, fill: t.ink, weight: 700 }),
              p.categoryName
                ? text(W - 80, y, clip(p.categoryName, 6), { size: 24, fill: t.sub, anchor: 'end' })
                : '',
            ].join('');
          })
          .join('')
      : text(80, 920, 'PICK을 고르면 여기에 보여요', { size: 26, fill: t.sub });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`,
    `<rect width="${W}" height="${H}" fill="${t.bg}"/>`,
    stars,
    text(W / 2, 112, `SEASON ${d.seasonNo} · HALL OF FAME`, {
      size: 28,
      fill: t.accent,
      weight: 800,
      anchor: 'middle',
    }),
    text(W / 2, 198, `${d.sigunguName} 먹짱`, {
      size: 66,
      fill: t.ink,
      weight: 800,
      anchor: 'middle',
    }),
    `<circle cx="${W / 2}" cy="440" r="190" fill="${t.soft}"/>`,
    mukkaebiAt(W / 2 - 150, 280, 300),
    text(W / 2, 700, clip(d.nickname, 12), {
      size: 50,
      fill: t.ink,
      weight: 800,
      anchor: 'middle',
    }),
    text(
      W / 2,
      752,
      `정복 ${d.conquestCount}곳 · ${d.sigunguName} 1위 · 신뢰 온도 ${d.trustTemp.toFixed(1)}°`,
      { size: 26, fill: t.sub, anchor: 'middle' },
    ),
    `<rect x="80" y="800" width="${W - 160}" height="2" fill="${t.soft}"/>`,
    text(80, 856, '내 PICK TOP 3', { size: 26, fill: t.accent, weight: 800 }),
    picks,
    `<rect y="${H - 200}" width="${W}" height="200" fill="#ffffff"/>`,
    text(80, H - 112, '먹장깨기', { size: 40, fill: '#2f5e3b', weight: 800 }),
    text(80, H - 64, 'QR로 내 PICK 전체 보기', { size: 24, fill: '#6b706b' }),
    qrPath(d.url, W - 80 - 150, H - 175, 150),
    '</svg>',
  ].join('');
}

export const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** 카드를 PNG로 (1080×1920) */
export async function cardPng(svg: string): Promise<Blob> {
  const img = new Image();
  img.src = svgDataUrl(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH * 1.5;
  canvas.height = CARD_HEIGHT * 1.5;
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('CARD_IMAGE_FAILED'))), 'image/png'),
  );
}
