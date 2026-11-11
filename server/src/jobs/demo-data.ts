import { prisma } from '../lib/prisma';
import { finalizeSeason } from '../modules/ranking/season-job';
import {
  loadRatingParams,
  refreshRestaurantStat,
  refreshReviewWeight,
} from '../modules/restaurant/restaurant-stat-calc';
import { recomputeSigunguRanking } from '../modules/ranking/tier';

// 랭킹 화면 확인용 가짜 데이터 (손으로만 돌린다. 주기 작업 all에는 없다)
// seed: 가짜 탐험가 24명 + 내 동네 구와 다른 구 3곳에 지난 시즌 2개·이번 시즌 정복 기록.
//   지난 시즌은 시즌 확정 코드(finalizeSeason)로 순위·결과·보상을 만들고, 이번 시즌은 구 순위만 계산한다.
//   내 계정도 시즌마다 정복 기록을 받고, 지난 시즌 결과·보상·알림도 실제로 받는다.
// reviews: 가짜 탐험가의 방문마다 리뷰(맛 별점·세부 별점·좋았던 점·글)를 붙이고, 내 동네(동)에도 가짜 방문·리뷰를 넣어
//   가게 별점·추천 맛집이 차 보이게 한다 (seed 다음에 돌린다).
// clear: 가짜 탐험가와 그 기록(리뷰 포함) 전부, 내 계정의 가짜 정복·지난 시즌 결과·보상을 지우고 순위·가게 별점을 다시 계산한다.

/** 가짜 탐험가의 kakao_id 앞부분 (실제 카카오 회원번호는 숫자뿐이라 겹치지 않는다) */
const DEMO_KAKAO_PREFIX = 'demo-';
/** 가짜 방문 인증의 영수증 key — 내 계정의 가짜 정복을 찾을 때 쓴다 */
const DEMO_RECEIPT_KEY = 'demo/receipt.jpg';
const DEMO_BIO = '랭킹 확인용 가짜 탐험가예요';
const NICKNAMES = [
  '떡볶이요정',
  '국밥한그릇',
  '면치기장인',
  '빵지순례자',
  '마라탕러버',
  '순대국러버',
  '돈까스왕',
  '김밥천재',
  '라멘탐험가',
  '곱창원정대',
  '냉면러버',
  '짬뽕한그릇',
  '초밥좋아',
  '치킨은진리',
  '파스타장인',
  '쌀국수러버',
  '분식대장',
  '디저트헌터',
  '카페투어러',
  '고기굽는곰',
  '해장국러버',
  '만두빚는곰',
  '칼국수장인',
  '덮밥러버',
];
/** 내 동네 구 다음으로 채울 구 (가게가 없는 구는 건너뛴다) */
const OTHER_SIGUNGUS = ['마포구', '강남구', '관악구', '송파구', '영등포구', '동작구'];
/** 내 동네 구 가짜 탐험가 정복 수: 21명이라 나까지 22명 → 2위도 상위 10% 안(정복자) */
const MAIN_COUNTS = [38, 31, 26, 22, 21, 17, 14, 12, 10, 8, 7, 6, 5, 5, 4, 3, 3, 2, 2, 1, 1];
const OTHER_COUNTS = [19, 14, 11, 8, 6, 5, 3, 2, 1];
/** 내 동네 구 내 정복 수: 이번 시즌(3위쯤), 지난 시즌(미식가), 그 전 시즌(먹짱) */
const MY_MAIN_COUNTS = [27, 24, 40];
/** 이번 시즌 두 번째 구 내 정복 수 */
const MY_SECOND_COUNT = 3;
const RESTAURANT_POOL = 150;
const DAY_MS = 24 * 60 * 60 * 1000;
/** reviews: 내 동네(동)마다 가짜 방문·리뷰를 넣을 가게 수 */
const LOCAL_SHOPS = 12;

// reviews: 리뷰 글 (맛 별점 4 이상은 좋았던 글, 아래는 아쉬운 점이 섞인 글)
const MEAL_TEXT = {
  good: [
    '양이 넉넉하고 간이 딱 맞아요. 점심에 또 올 것 같아요.',
    '사장님이 친절하시고 음식이 빨리 나와요.',
    '재료가 신선한 게 느껴져요. 동네에 이런 집이 있어서 다행이에요.',
    '가격 대비 만족스러워요. 반찬도 계속 채워 주세요.',
    '웨이팅이 조금 있었지만 기다린 보람이 있었어요.',
    '혼밥하기 편하고 맛도 꾸준해요.',
    '친구랑 갔는데 둘 다 만족했어요. 다음엔 다른 메뉴도 먹어 볼래요.',
    '국물이 진하고 깔끔해요. 해장으로 딱이에요.',
  ],
  mixed: [
    '맛은 괜찮은데 점심시간엔 좀 붐벼요.',
    '무난하게 먹기 좋아요. 다만 간이 조금 센 편이에요.',
    '양은 많은데 가격이 살짝 올랐어요.',
    '자리가 좁아서 여럿이 가기엔 불편했어요. 맛은 평범해요.',
  ],
};
const CAFE_TEXT = {
  good: [
    '커피가 진하고 디저트가 달지 않아서 좋아요.',
    '자리가 넓어서 공부하기 편해요. 콘센트도 많아요.',
    '케이크가 촉촉하고 직원분들이 친절해요.',
    '창가 자리 분위기가 좋아요. 조용히 쉬다 가기 좋아요.',
  ],
  mixed: [
    '분위기는 좋은데 음료 가격이 조금 있어요.',
    '주말엔 자리가 없어요. 평일에 가는 걸 추천해요.',
  ],
};

/** 맛 별점은 0.5 단위, 세부 별점은 1 단위 (1~5) */
const half = (n: number) => Math.min(5, Math.max(1, Math.round(n * 2) / 2));
const whole = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 같은 결과가 나오는 난수 (mulberry32) */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 가짜로 확정한 지난 시즌의 확정 시각 = 끝난 다음 날 00:05 (KST). clear는 이 시각으로 내 보상을 찾는다 */
function demoFinalizedAt(season: { endDate: Date }) {
  return new Date(season.endDate.getTime() + DAY_MS - KST_OFFSET_MS + 5 * 60 * 1000);
}

async function findMe(nickname: string) {
  const me = await prisma.member.findFirst({
    where: { nickname, status: 'A' },
    select: { id: true, kakaoId: true },
  });
  // 가짜 탐험가 닉네임을 넣으면 그 계정은 clear가 지우므로 받지 않는다
  if (!me || me.kakaoId?.startsWith(DEMO_KAKAO_PREFIX)) {
    throw new Error(`닉네임이 ${nickname}인 회원이 없어요`);
  }
  return me.id;
}

async function demoMemberIds() {
  const rows = await prisma.member.findMany({
    where: { kakaoId: { startsWith: DEMO_KAKAO_PREFIX } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** 정복 기록으로 한 사람·한 시즌·한 구의 정복 수를 다시 센다. 0곳이면 그 행을 지운다 */
async function recountStat(seasonId: number, sigunguId: number, userId: bigint) {
  const where = { seasonId, sigunguId, userId };
  const agg = await prisma.conquest.aggregate({
    where,
    _count: { _all: true },
    _max: { conqueredAt: true },
  });
  if (agg._count._all === 0) {
    const stat = await prisma.seasonRegionStat.findUnique({
      where: { seasonId_sigunguId_userId: where },
      select: { id: true },
    });
    if (!stat) return;
    // 지울 행을 대표 칭호로 쓰고 있으면 자동(이번 시즌 가장 높은 티어)으로 돌린다
    await prisma.member.updateMany({
      where: { id: userId, repTitleType: 'T', repTitleRef: stat.id },
      data: { repTitleType: null, repTitleRef: null },
    });
    await prisma.seasonRegionStat.delete({ where: { id: stat.id } });
    return;
  }
  await prisma.seasonRegionStat.upsert({
    where: { seasonId_sigunguId_userId: where },
    update: { conquestCount: agg._count._all, lastConqueredAt: agg._max.conqueredAt },
    create: { ...where, conquestCount: agg._count._all, lastConqueredAt: agg._max.conqueredAt },
  });
}

async function recompute(pairs: Iterable<string>) {
  for (const pair of pairs) {
    const [seasonId, sigunguId] = pair.split(':').map(Number);
    await prisma.$transaction((tx) => recomputeSigunguRanking(tx, seasonId, sigunguId));
  }
}

export async function seedDemoData(nickname: string) {
  const me = await findMe(nickname);
  if ((await demoMemberIds()).length > 0) {
    throw new Error('가짜 데이터가 이미 있어요. clear를 먼저 돌려 주세요');
  }
  const current = await prisma.season.findFirst({ where: { status: 'A' } });
  if (!current) throw new Error('진행 중인 시즌이 없어요');
  const past = await prisma.season.findMany({
    where: { endDate: { lt: current.startDate } },
    orderBy: { seasonNo: 'desc' },
    take: MY_MAIN_COUNTS.length - 1,
  });
  // 지난 시즌은 확정 코드를 다시 돌리므로 진짜 기록(별점 대기 방문 포함)이 있으면 건드리지 않는다
  for (const season of past) {
    const [stats, results, visits] = await Promise.all([
      prisma.seasonRegionStat.count({ where: { seasonId: season.id } }),
      prisma.seasonResult.count({ where: { seasonId: season.id } }),
      prisma.visit.count({ where: { seasonId: season.id } }),
    ]);
    if (stats + results + visits > 0) {
      throw new Error(`시즌 ${season.seasonNo}에 이미 기록이 있어요`);
    }
  }
  // 시즌·업적 보상 아이템을 이미 가졌으면 clear가 받은 만큼만 되돌릴 수 없어 멈춘다
  const owned = await prisma.memberItem.findMany({
    where: {
      userId: me,
      item: { OR: [{ seasonRewardRules: { some: {} } }, { requiredAchievementId: { not: null } }] },
    },
    select: { item: { select: { name: true } } },
  });
  if (owned.length > 0) {
    throw new Error(
      `시즌·업적 보상 아이템을 이미 가지고 있어요: ${owned.map((o) => o.item.name).join(', ')}`,
    );
  }

  const rand = random(20261110);
  const local = await prisma.memberLocalRegion.findMany({
    where: { userId: me },
    orderBy: { sortOrder: 'asc' },
    select: { sigunguId: true },
  });
  const localIds = new Set(local.map((l) => l.sigunguId));
  const others = await prisma.region.findMany({
    where: { level: 2, name: { in: OTHER_SIGUNGUS } },
    select: { id: true, name: true },
  });
  const fallback = await prisma.region.findFirst({ where: { level: 2, name: '강서구' } });
  const candidates = [
    local[0]?.sigunguId ?? fallback?.id,
    ...OTHER_SIGUNGUS.map((name) => others.find((o) => o.name === name)?.id),
  ].filter((id, i, all): id is number => id !== undefined && all.indexOf(id) === i);
  // 구마다 가게 후보 (가게가 없는 구는 건너뛴다)
  const sigungus: { id: number; pool: bigint[] }[] = [];
  for (const id of candidates) {
    if (sigungus.length === 4) break;
    const rows = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM restaurant WHERE status = 'A' AND sigungu_id = ${id}
      ORDER BY RAND(${id}) LIMIT ${RESTAURANT_POOL}`;
    if (rows.length > 0) sigungus.push({ id, pool: rows.map((r) => BigInt(r.id)) });
  }
  if (sigungus.length === 0) throw new Error('가게가 있는 구가 없어요');

  const levels = await prisma.levelPolicy.findMany({ where: { level: { lte: 15 } } });
  const hats = await prisma.item.findMany({
    where: { category: 'HAT', status: 'A', requiredAchievementId: null },
    select: { id: true },
  });
  const demo: bigint[] = [];
  for (const [i, nickname] of NICKNAMES.entries()) {
    const level = levels[Math.floor(rand() * levels.length)];
    const hat = rand() < 0.6 ? hats[Math.floor(rand() * hats.length)] : undefined;
    const taken = await prisma.member.count({ where: { nickname } });
    const member = await prisma.member.create({
      data: {
        kakaoId: `${DEMO_KAKAO_PREFIX}${String(i + 1).padStart(2, '0')}`,
        nickname: taken ? `${nickname.slice(0, 8)}${i + 1}` : nickname,
        bio: DEMO_BIO,
        status: 'A',
        mukkaebi: {
          create: {
            level: level?.level ?? 1,
            exp: level?.requiredExp ?? 0,
            celebratedLevel: level?.level ?? 1,
            hatItemId: hat?.id ?? null,
          },
        },
      },
    });
    demo.push(member.id);
  }

  // 내가 방문 인증을 한 적 있는 가게(진행 중·별점 대기 포함)는 빼고 고른다.
  // 가짜 정복이 있으면 진짜 별점을 등록해도 정복이 새로 생기지 않는다 (사람·가게·시즌마다 정복은 1번)
  const mine = await prisma.visit.findMany({
    where: { userId: me, restaurantId: { not: null } },
    select: { restaurantId: true },
  });
  const myVisited = new Set(mine.map((v) => String(v.restaurantId)));
  const now = new Date();
  const seasons = [current, ...past];
  let conquests = 0;
  for (const [s, season] of seasons.entries()) {
    const start = season.startDate.getTime() - KST_OFFSET_MS;
    const end = Math.min(season.endDate.getTime() + DAY_MS - KST_OFFSET_MS, now.getTime());
    for (const [k, sigungu] of sigungus.entries()) {
      const counts = k === 0 ? MAIN_COUNTS : OTHER_COUNTS;
      const people: [bigint, number][] = shuffle(demo, rand)
        .slice(0, counts.length)
        .map((id, i) => [id, counts[i]]);
      const myCount = k === 0 ? MY_MAIN_COUNTS[s] : k === 1 && s === 0 ? MY_SECOND_COUNT : 0;
      if (myCount) people.push([me, myCount]);
      for (const [userId, count] of people) {
        const pool = shuffle(sigungu.pool, rand).filter(
          (id) => !(userId === me && myVisited.has(id.toString())),
        );
        await prisma.$transaction(async (tx) => {
          for (const restaurantId of pool.slice(0, count)) {
            const at = new Date(start + Math.floor(rand() * (end - start)));
            const visit = await tx.visit.create({
              data: {
                userId,
                restaurantId,
                seasonId: season.id,
                method: 'R',
                status: 'C',
                receiptImageKey: DEMO_RECEIPT_KEY,
                isLocal: userId === me && localIds.has(sigungu.id),
                verifiedAt: at,
                regDate: at,
              },
            });
            await tx.conquest.create({
              data: {
                userId,
                restaurantId,
                seasonId: season.id,
                sigunguId: sigungu.id,
                visitId: visit.id,
                conqueredAt: at,
              },
            });
            conquests += 1;
          }
        });
        await recountStat(season.id, sigungu.id, userId);
      }
    }
  }
  await recompute(sigungus.map((g) => `${current.id}:${g.id}`));
  // 지난 시즌은 오래된 것부터 확정 코드로 순위·결과·보상을 만든다 (이미 F여도 E로 돌려 다시 확정)
  for (const season of [...past].reverse()) {
    await prisma.season.update({ where: { id: season.id }, data: { status: 'E' } });
    await finalizeSeason(season.id, demoFinalizedAt(season));
  }
  // 가짜 탐험가마다 PICK 2곳 (이번 시즌 정복한 가게 중)
  for (const userId of demo) {
    const picks = await prisma.conquest.findMany({
      where: { userId, seasonId: current.id },
      orderBy: { conqueredAt: 'desc' },
      take: 2,
      select: { restaurantId: true },
    });
    await prisma.memberPick.createMany({
      data: picks.map((p, sortOrder) => ({ userId, restaurantId: p.restaurantId, sortOrder })),
    });
  }
  return {
    members: demo.length,
    conquests,
    sigungus: sigungus.length,
    seasons: seasons.map((s) => s.seasonNo),
  };
}

/** reviews: 가짜 리뷰·내 동네 가짜 방문. 가짜 탐험가가 없거나 가짜 리뷰가 이미 있으면 멈춘다 */
export async function seedDemoReviews(nickname: string) {
  const me = await findMe(nickname);
  const demo = await demoMemberIds();
  if (demo.length === 0) throw new Error('가짜 탐험가가 없어요. seed를 먼저 돌려 주세요');
  if ((await prisma.review.count({ where: { userId: { in: demo } } })) > 0) {
    throw new Error('가짜 리뷰가 이미 있어요. clear를 먼저 돌려 주세요');
  }
  const current = await prisma.season.findFirst({ where: { status: 'A' } });
  if (!current) throw new Error('진행 중인 시즌이 없어요');
  const rand = random(20261111);
  const now = new Date();
  const start = current.startDate.getTime() - KST_OFFSET_MS;

  // 1. 내 동네(동)마다 가게 12곳에 가짜 탐험가 5~9명이 방문 (셋 중 하나는 한 번 더 — 재방문 수에 쓰인다).
  //    추천 맛집은 동 안의 현지인 방문·재방문·별점으로 고르므로 동 단위로 넣는다
  const locals = await prisma.memberLocalRegion.findMany({
    where: { userId: me },
    select: { regionId: true },
  });
  const touched = new Set<string>();
  let localVisits = 0;
  for (const { regionId } of locals) {
    const shops = await prisma.$queryRaw<{ id: bigint; sigungu_id: number }[]>`
      SELECT id, sigungu_id FROM restaurant WHERE status = 'A' AND region_id = ${regionId}
      ORDER BY RAND(${regionId}) LIMIT ${LOCAL_SHOPS}`;
    for (const shop of shops) {
      const restaurantId = BigInt(shop.id);
      const sigunguId = Number(shop.sigungu_id);
      const visitors = shuffle(demo, rand).slice(0, 5 + Math.floor(rand() * 5));
      await prisma.$transaction(async (tx) => {
        for (const userId of visitors) {
          let at = start + rand() * (now.getTime() - start) * 0.6;
          const times = rand() < 0.35 ? 2 : 1;
          for (let t = 0; t < times; t += 1) {
            if (t > 0) at += rand() * (now.getTime() - at);
            const visit = await tx.visit.create({
              data: {
                userId,
                restaurantId,
                seasonId: current.id,
                method: 'R',
                status: 'C',
                receiptImageKey: DEMO_RECEIPT_KEY,
                isLocal: rand() < 0.7,
                verifiedAt: new Date(at),
                regDate: new Date(at),
              },
            });
            localVisits += 1;
            // 정복은 사람·가게·시즌마다 한 번 (다시 간 방문은 정복 없이 별점만)
            const conquered = await tx.conquest.count({
              where: { userId, restaurantId, seasonId: current.id },
            });
            if (conquered === 0) {
              await tx.conquest.create({
                data: {
                  userId,
                  restaurantId,
                  seasonId: current.id,
                  sigunguId,
                  visitId: visit.id,
                  conqueredAt: new Date(at),
                },
              });
              touched.add(`${current.id}:${sigunguId}:${userId}`);
            }
          }
        }
      });
    }
  }
  for (const key of touched) {
    const [seasonId, sigunguId, userId] = key.split(':');
    await recountStat(Number(seasonId), Number(sigunguId), BigInt(userId));
  }
  await recompute(new Set([...touched].map((k) => k.split(':').slice(0, 2).join(':'))));

  // 2. 가짜 탐험가의 방문마다 리뷰. 가게마다 맛 수준(3.2~4.8)을 정해 두고 그 근처로 준다
  const visits = await prisma.visit.findMany({
    where: { userId: { in: demo }, status: 'C', review: null, restaurantId: { not: null } },
    orderBy: [{ verifiedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      userId: true,
      restaurantId: true,
      verifiedAt: true,
      restaurant: { select: { category: { select: { name: true } } } },
    },
  });
  const aspects = await prisma.reviewAspect.findMany({ select: { id: true, code: true } });
  const aspectOf = (code: string) => aspects.find((a) => a.code === code)?.id;
  const levelOf = new Map<string, number>();
  const been = new Set<string>();
  const reviewIds: bigint[] = [];
  const shops = new Set<bigint>();
  for (let i = 0; i < visits.length; i += 200) {
    await prisma.$transaction(
      async (tx) => {
        for (const v of visits.slice(i, i + 200)) {
          const restaurantId = v.restaurantId as bigint;
          const key = restaurantId.toString();
          const level = levelOf.get(key) ?? 3.2 + rand() * 1.6;
          levelOf.set(key, level);
          const score = half(level + (rand() - 0.5));
          const isRevisit = been.has(`${v.userId}:${key}`);
          been.add(`${v.userId}:${key}`);
          const at = new Date(
            Math.min((v.verifiedAt ?? now).getTime() + (10 + rand() * 80) * 60_000, now.getTime()),
          );
          const detail = rand() < 0.6;
          const texts = v.restaurant?.category?.name === '카페·디저트' ? CAFE_TEXT : MEAL_TEXT;
          const pool = score >= 4 ? texts.good : texts.mixed;
          const content = rand() < 0.7 ? pool[Math.floor(rand() * pool.length)] : null;
          const review = await tx.review.create({
            data: {
              visitId: v.id,
              userId: v.userId,
              restaurantId,
              overallScore: score,
              isRevisit,
              regDate: at,
              ...(detail && {
                cleanliness: whole(level + (rand() - 0.5) * 2),
                portion: whole(level + (rand() - 0.5) * 2),
                service: whole(level + (rand() - 0.5) * 2),
                price: whole(level + (rand() - 0.5) * 2),
                detailRegDate: at,
              }),
              ...(content && { content, contentRegDate: at }),
              // 가짜 글은 Gemini 리뷰 분석(review-ai)에 보내지 않는다
              aiCheckedAt: at,
            },
          });
          if (detail) {
            const good = shuffle(['TASTE', 'PORTION', 'PRICE', 'SERVICE', 'CLEAN', 'MOOD'], rand)
              .slice(0, 1 + Math.floor(rand() * 2))
              .map((code) => ({ code, polarity: 'G' }));
            const bad =
              score <= 3.5 ? [{ code: rand() < 0.5 ? 'WAIT' : 'PRICE', polarity: 'B' }] : [];
            const marks = [...good, ...bad.filter((b) => !good.some((g) => g.code === b.code))];
            await tx.reviewAspectMark.createMany({
              data: marks.flatMap((m) => {
                const aspectId = aspectOf(m.code);
                return aspectId
                  ? [{ reviewId: review.id, aspectId, polarity: m.polarity, regDate: at }]
                  : [];
              }),
            });
          }
          reviewIds.push(review.id);
          shops.add(restaurantId);
        }
      },
      { timeout: 60_000 },
    );
  }

  // 3. 리뷰 가중치(같은 사람 재방문·신뢰도)와 가게 별점·방문 수를 다시 계산한다
  const params = await loadRatingParams(prisma);
  for (let i = 0; i < reviewIds.length; i += 200) {
    await prisma.$transaction(
      async (tx) => {
        for (const id of reviewIds.slice(i, i + 200)) await refreshReviewWeight(tx, id, params);
      },
      { timeout: 60_000 },
    );
  }
  for (const id of shops) await refreshRestaurantStat(prisma, id, now, params);
  return { localVisits, reviews: reviewIds.length, restaurants: shops.size };
}

export async function clearDemoData(nickname: string) {
  const me = await findMe(nickname);
  const demo = await demoMemberIds();
  const demoVisit = { receiptImageKey: DEMO_RECEIPT_KEY };
  const touchedRows = await prisma.conquest.findMany({
    where: { OR: [{ userId: { in: demo } }, { userId: me, visit: demoVisit }] },
    distinct: ['seasonId', 'sigunguId'],
    select: { seasonId: true, sigunguId: true },
  });
  const touched = new Set(touchedRows.map((r) => `${r.seasonId}:${r.sigunguId}`));

  // 1. 가짜로 확정한 지난 시즌에 내가 받은 결과·보상 (확정 시각으로 찾는다)
  const seasons = (await prisma.season.findMany({ orderBy: { seasonNo: 'asc' } })).filter(
    (s) => s.finalizedAt?.getTime() === demoFinalizedAt(s).getTime(),
  );
  const times = seasons.map((s) => demoFinalizedAt(s));
  const points = await prisma.pointHistory.aggregate({
    where: { userId: me, regDate: { in: times } },
    _sum: { amount: true },
  });
  const pointBack = points._sum.amount ?? 0;
  await prisma.$transaction(async (tx) => {
    await tx.pointHistory.deleteMany({ where: { userId: me, regDate: { in: times } } });
    // 받은 먹포인트를 그사이 써 버렸으면 0에서 멈춘다
    await tx.$executeRaw`
      UPDATE member SET point_balance = GREATEST(point_balance - ${pointBack}, 0) WHERE id = ${me}`;
    await tx.memberItem.deleteMany({ where: { userId: me, acquiredAt: { in: times } } });
    await tx.memberAchievement.deleteMany({ where: { userId: me, achievedAt: { in: times } } });
    await tx.notification.deleteMany({ where: { userId: me, regDate: { in: times } } });
    await tx.seasonResult.deleteMany({
      where: { userId: me, seasonId: { in: seasons.map((s) => s.id) } },
    });
    // 지운 아이템을 쓰고 있었으면 벗긴다
    const kept = new Set(
      (await tx.memberItem.findMany({ where: { userId: me }, select: { itemId: true } })).map(
        (i) => i.itemId,
      ),
    );
    const mukkaebi = await tx.mukkaebi.findUnique({ where: { userId: me } });
    if (mukkaebi) {
      const off = (id: number | null) => (id !== null && !kept.has(id) ? null : id);
      await tx.mukkaebi.update({
        where: { userId: me },
        data: {
          hatItemId: off(mukkaebi.hatItemId),
          faceItemId: off(mukkaebi.faceItemId),
          propItemId: off(mukkaebi.propItemId),
          skinItemId: off(mukkaebi.skinItemId),
          clubItemId: off(mukkaebi.clubItemId),
        },
      });
    }
  });

  // 2. 내 가짜 정복 → 정복 수 다시 세기.
  // 가짜 정복이 있는 가게를 그사이 진짜로 인증하고 별점까지 남겼으면(그때는 정복이 새로 안 생긴다)
  // 그 정복은 지우지 않고 진짜 방문으로 옮긴다
  const myDemo = await prisma.conquest.findMany({
    where: { userId: me, visit: demoVisit },
    select: { id: true, visitId: true, restaurantId: true, seasonId: true },
  });
  const realDone = await prisma.visit.findMany({
    where: {
      userId: me,
      status: 'C',
      conquest: null,
      AND: [
        { OR: [{ receiptImageKey: null }, { receiptImageKey: { not: DEMO_RECEIPT_KEY } }] },
        { OR: myDemo.map((c) => ({ restaurantId: c.restaurantId, seasonId: c.seasonId })) },
      ],
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      restaurantId: true,
      seasonId: true,
      verifiedAt: true,
      review: { select: { regDate: true } },
    },
  });
  const moved = myDemo.flatMap((c) => {
    const real = realDone.find(
      (v) => v.restaurantId === c.restaurantId && v.seasonId === c.seasonId,
    );
    return real ? [{ conquestId: c.id, real }] : [];
  });
  await prisma.$transaction([
    ...moved.map(({ conquestId, real }) =>
      prisma.conquest.update({
        where: { id: conquestId },
        data: {
          visitId: real.id,
          conqueredAt: real.review?.regDate ?? real.verifiedAt ?? new Date(),
        },
      }),
    ),
    prisma.conquest.deleteMany({
      where: {
        id: { in: myDemo.map((c) => c.id) },
        NOT: { id: { in: moved.map((m) => m.conquestId) } },
      },
    }),
    prisma.visit.deleteMany({ where: { id: { in: myDemo.map((c) => c.visitId) } } }),
  ]);
  for (const pair of touched) {
    const [seasonId, sigunguId] = pair.split(':').map(Number);
    await recountStat(seasonId, sigunguId, me);
  }

  // 3. 가짜 탐험가와 그 기록 전부 (리뷰를 지운 가게는 별점·방문 수를 다시 센다)
  const userId = { in: demo };
  const demoShops = await prisma.visit.findMany({
    where: { userId, restaurantId: { not: null } },
    distinct: ['restaurantId'],
    select: { restaurantId: true },
  });
  const demoReviews = { review: { userId } };
  await prisma.$transaction([
    prisma.reviewAspectMark.deleteMany({ where: demoReviews }),
    prisma.reviewImage.deleteMany({ where: demoReviews }),
    // 확인하다가 가짜 리뷰에 도움돼요를 눌렀을 수 있다
    prisma.reviewReaction.deleteMany({ where: { OR: [demoReviews, { userId }] } }),
    prisma.restaurantMapae.updateMany({ where: demoReviews, data: { reviewId: null } }),
    prisma.review.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.pointHistory.deleteMany({ where: { userId } }),
    prisma.expHistory.deleteMany({ where: { userId } }),
    prisma.memberItem.deleteMany({ where: { userId } }),
    prisma.memberAchievement.deleteMany({ where: { userId } }),
    prisma.seasonResult.deleteMany({ where: { userId } }),
    prisma.seasonRegionStat.deleteMany({ where: { userId } }),
    prisma.memberPick.deleteMany({ where: { userId } }),
    // 확인하다가 가짜 탐험가를 차단했을 수 있다
    prisma.memberBlock.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    }),
    prisma.conquest.deleteMany({ where: { userId } }),
    prisma.visit.deleteMany({ where: { userId } }),
    prisma.mukkaebi.deleteMany({ where: { userId } }),
    prisma.member.deleteMany({ where: { id: userId } }),
  ]);

  // 4. 남은 사람들의 순위를 다시 계산하고, 지난 시즌 확정 시각을 처음처럼 비운다
  await recompute(touched);
  for (const { restaurantId } of demoShops) {
    if (restaurantId !== null) await refreshRestaurantStat(prisma, restaurantId);
  }
  await prisma.season.updateMany({
    where: { id: { in: seasons.map((s) => s.id) } },
    data: { finalizedAt: null },
  });
  return {
    members: demo.length,
    myConquests: myDemo.length,
    pointBack,
    seasons: seasons.map((s) => s.seasonNo),
  };
}
