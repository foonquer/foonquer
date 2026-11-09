import { prisma } from '../lib/prisma';
import { finalizeSeason } from '../modules/ranking/season-job';
import { recomputeSigunguRanking } from '../modules/ranking/tier';

// 랭킹 화면 확인용 가짜 데이터 (손으로만 돌린다. 주기 작업 all에는 없다)
// seed: 가짜 탐험가 24명 + 내 동네 구와 다른 구 3곳에 지난 시즌 2개·이번 시즌 정복 기록.
//   지난 시즌은 시즌 확정 코드(finalizeSeason)로 순위·결과·보상을 만들고, 이번 시즌은 구 순위만 계산한다.
//   내 계정도 시즌마다 정복 기록을 받고, 지난 시즌 결과·보상·알림도 실제로 받는다.
// clear: 가짜 탐험가와 그 기록 전부, 내 계정의 가짜 정복·지난 시즌 결과·보상을 지우고 순위를 다시 계산한다.

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
  // 지난 시즌은 확정 코드를 다시 돌리므로 진짜 기록이 있으면 건드리지 않는다
  for (const season of past) {
    const [stats, results] = await Promise.all([
      prisma.seasonRegionStat.count({ where: { seasonId: season.id } }),
      prisma.seasonResult.count({ where: { seasonId: season.id } }),
    ]);
    if (stats + results > 0) throw new Error(`시즌 ${season.seasonNo}에 이미 기록이 있어요`);
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

  // 이번 시즌에 내가 이미 정복한 가게는 빼고 고른다 (사람·가게·시즌마다 정복은 1번)
  const mine = await prisma.conquest.findMany({
    where: { userId: me, seasonId: current.id },
    select: { restaurantId: true },
  });
  const myCurrent = new Set(mine.map((c) => c.restaurantId.toString()));
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
          (id) => !(userId === me && s === 0 && myCurrent.has(id.toString())),
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

  // 2. 내 가짜 정복 → 정복 수 다시 세기
  const myDemo = await prisma.conquest.findMany({
    where: { userId: me, visit: demoVisit },
    select: { id: true, visitId: true },
  });
  await prisma.$transaction([
    prisma.conquest.deleteMany({ where: { id: { in: myDemo.map((c) => c.id) } } }),
    prisma.visit.deleteMany({ where: { id: { in: myDemo.map((c) => c.visitId) } } }),
  ]);
  for (const pair of touched) {
    const [seasonId, sigunguId] = pair.split(':').map(Number);
    await recountStat(seasonId, sigunguId, me);
  }

  // 3. 가짜 탐험가와 그 기록 전부
  const userId = { in: demo };
  await prisma.$transaction([
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
