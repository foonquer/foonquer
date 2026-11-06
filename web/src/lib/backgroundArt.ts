// 구 배경 그림 (피그마 구 배경 보드 547:12811에서 내보낸 SVG). 파일 이름 = region.bg_key (BG_{시군구 코드})

const ART = import.meta.glob<string>('../assets/backgrounds/*.svg', {
  eager: true,
  import: 'default',
});

/** 구 배경 키의 그림 주소 (그림이 없는 구면 undefined → 구 이름만) */
export function backgroundArt(bgKey: string | null | undefined) {
  return bgKey ? ART[`../assets/backgrounds/${bgKey}.svg`] : undefined;
}
