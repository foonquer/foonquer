import type { Db } from '../../common/db';
import { prisma } from '../../lib/prisma';

/** level_policy.stage → API */
export const STAGE_API: Record<string, string> = { E: 'EGG', B: 'BABY', K: 'KID', A: 'ADULT' };
export const STAGE_NAME: Record<string, string> = { E: '알', B: '아기', K: '어린이', A: '어른' };

const itemSelect = {
  select: { id: true, code: true, name: true, category: true, rarity: true },
} as const;

type ItemLite = { id: number; code: string; name: string; category: string; rarity: string } | null;
/** 착용 아이템 — 등급(rarity)은 꾸미기·상점과 같은 색을 쓰려고 함께 준다 */
const toItem = (item: ItemLite) =>
  item ? { itemId: item.id, code: item.code, name: item.name, rarity: item.rarity } : null;

/**
 * 먹깨비 요약 (CHAR-01, 탐방러 프로필, 홈 요약 공통): 레벨·경험치·성장 단계·착용 아이템·배경·지도 위 위치.
 * 먹깨비 행이 아직 없으면 LV.1 알로 본다.
 */
export async function loadMukkaebi(userId: bigint, db: Db = prisma) {
  const m = await db.mukkaebi.findUnique({
    where: { userId },
    include: {
      hatItem: itemSelect,
      faceItem: itemSelect,
      propItem: itemSelect,
      skinItem: itemSelect,
      clubItem: itemSelect,
      bgSigungu: { select: { id: true, name: true, bgKey: true } },
      currentRestaurant: { select: { id: true, name: true, lat: true, lng: true } },
    },
  });
  const level = m?.level ?? 1;
  const exp = m?.exp ?? 0;
  const [policy, next] = await Promise.all([
    db.levelPolicy.findUnique({ where: { level } }),
    db.levelPolicy.findUnique({ where: { level: level + 1 } }),
  ]);
  const stage = policy?.stage ?? 'E';
  return {
    level,
    exp,
    levelExp: policy?.requiredExp ?? 0,
    nextLevelExp: next?.requiredExp ?? null,
    stage: STAGE_API[stage] ?? 'EGG',
    stageName: STAGE_NAME[stage] ?? '알',
    sizePercent: policy?.sizePercent ?? 100,
    equipped: {
      hat: toItem(m?.hatItem ?? null),
      face: toItem(m?.faceItem ?? null),
      prop: toItem(m?.propItem ?? null),
      skin: toItem(m?.skinItem ?? null),
      club: toItem(m?.clubItem ?? null),
    },
    background: m?.bgSigungu
      ? { sigunguId: m.bgSigungu.id, sigunguName: m.bgSigungu.name, bgKey: m.bgSigungu.bgKey }
      : null,
    currentRestaurant: m?.currentRestaurant
      ? {
          restaurantId: m.currentRestaurant.id,
          name: m.currentRestaurant.name,
          lat: m.currentRestaurant.lat.toNumber(),
          lng: m.currentRestaurant.lng.toNumber(),
        }
      : null,
    celebratedLevel: m?.celebratedLevel ?? 1,
  };
}
