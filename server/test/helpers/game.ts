import { prisma } from '../../src/lib/prisma';
import { applyConquest } from '../../src/modules/conquest/conquest.service';
import { createRestaurant, createVisit } from './fixtures';

/** 서비스 정복 처리(REVIEW-01과 같은 함수)로 가게 n곳을 정복시킨다 */
export async function conquerMany(
  userId: bigint,
  seasonId: number,
  count: number,
  data: Parameters<typeof createRestaurant>[0] = {},
) {
  const shops = [];
  for (let i = 0; i < count; i += 1) {
    const shop = await createRestaurant(data);
    const visit = await createVisit(userId, shop.id, { seasonId, status: 'C' });
    await prisma.$transaction((tx) =>
      applyConquest(tx, { userId, visitId: visit.id, restaurant: shop, seasonId, now: new Date() }),
    );
    shops.push(shop);
  }
  return shops;
}

/** 아이템 코드 → id */
export async function itemId(code: string) {
  return (await prisma.item.findUniqueOrThrow({ where: { code } })).id;
}
