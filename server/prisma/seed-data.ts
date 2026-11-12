import type { PrismaClient } from '../src/generated/prisma/client';
import { SEOUL, SEOUL_DONG, SEOUL_SIGUNGU } from '../src/modules/region/seoul-regions';
import { POLICY_DRAFT_VERSION, POLICY_TEXTS } from './policies';

// 바뀌지 않는 기본 데이터. 여러 번 실행해도 같은 결과가 되도록 upsert만 쓴다.
// prisma/seed.ts(배포·로컬)와 테스트 준비(test/global-setup.ts)가 같이 쓴다.

// ERD category 노트의 id 순서 = 검색 홈 칩 순서 (2026-10-08 12개 확정)
const categories = [
  '한식',
  '중식',
  '일식',
  '양식',
  '분식',
  '고깃집',
  '해산물',
  '치킨',
  '패스트푸드',
  '아시안',
  '카페·디저트',
  '기타',
];

async function seedCategories(prisma: PrismaClient) {
  for (const [index, name] of categories.entries()) {
    const id = index + 1;
    await prisma.category.upsert({
      where: { id },
      update: { name, sortOrder: id },
      create: { id, name, sortOrder: id },
    });
  }
  return categories.length;
}

// 약관 문서. 회원가입·약관 동의(member_consent.policy_version)가 지금 시행 중인 버전을 가리켜야 해서 첫 버전을 넣어 둔다.
// 첫 버전 본문은 자리표시였고, 실제 문구는 새 version 행(prisma/policies.ts, 2026-11-12 초안)으로 추가했다.
// 이미 있는 행은 덮어쓰지 않는다(동의 기록이 가리키는 버전의 내용이 바뀌면 안 되므로).
const FIRST_POLICY_VERSION = '2026-09-01';
const policyDocuments = [
  { type: 'TERMS', title: '서비스 이용약관' },
  { type: 'PRIVACY', title: '개인정보 수집·이용 동의' },
  { type: 'LOCATION', title: '위치기반 서비스 이용약관' },
] as const;

async function seedPolicyDocuments(prisma: PrismaClient) {
  // 버전 이름이 곧 시행일이다
  const rows = [
    ...policyDocuments.map((doc) => ({
      type: doc.type,
      version: FIRST_POLICY_VERSION,
      content: `${doc.title} (초안)\n\n본문은 준비 중입니다.`,
    })),
    ...policyDocuments.map((doc) => ({
      type: doc.type,
      version: POLICY_DRAFT_VERSION,
      content: POLICY_TEXTS[doc.type],
    })),
  ];
  let created = 0;
  for (const row of rows) {
    const exists = await prisma.policyDocument.findUnique({
      where: { type_version: { type: row.type, version: row.version } },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.policyDocument.create({
      data: { ...row, effectiveDate: new Date(`${row.version}T00:00:00Z`) },
    });
    created += 1;
  }
  return created;
}

// 서울 구 25개·법정동 467개 (src/modules/region/data/seoul-regions.json). 법정동 코드(region.code)로 upsert한다.
// 처음 넣을 때 서울특별시 → 구(코드 순) → 동(코드 순)으로 넣어서 새 DB에서는 id가 항상 같다.
async function seedRegions(prisma: PrismaClient) {
  const decimal = (n: number) => n.toFixed(7);
  const upsert = async (
    code: string,
    data: { name: string; fullName: string; level: number; parentId: number | null },
    center: { lat: number; lng: number },
  ) => {
    const values = {
      ...data,
      centerLat: decimal(center.lat),
      centerLng: decimal(center.lng),
    };
    return prisma.region.upsert({
      where: { code },
      update: values,
      create: { code, ...values },
      select: { id: true },
    });
  };

  const sido = await upsert(
    SEOUL.code,
    { name: SEOUL.name, fullName: SEOUL.name, level: 1, parentId: null },
    SEOUL,
  );
  const sigunguIds = new Map<string, { id: number; name: string }>();
  for (const gu of SEOUL_SIGUNGU) {
    const row = await upsert(
      gu.code,
      { name: gu.name, fullName: `${SEOUL.name} ${gu.name}`, level: 2, parentId: sido.id },
      gu,
    );
    sigunguIds.set(gu.code, { id: row.id, name: gu.name });
    // 구 특색 배경 에셋 이름 (프론트 에셋과 맞춘다). 이미 다른 값이 들어 있으면 그대로 둔다
    await prisma.region.updateMany({
      where: { id: row.id, bgKey: null },
      data: { bgKey: `BG_${gu.code}` },
    });
  }
  for (const dong of SEOUL_DONG) {
    const gu = sigunguIds.get(dong.sigunguCode);
    if (!gu) throw new Error(`구를 찾을 수 없습니다: ${dong.code} ${dong.name}`);
    await upsert(
      dong.code,
      {
        name: dong.name,
        fullName: `${SEOUL.name} ${gu.name} ${dong.name}`,
        level: 3,
        parentId: gu.id,
      },
      dong,
    );
  }
  return { sigunguCount: SEOUL_SIGUNGU.length, dongCount: SEOUL_DONG.length };
}

// 신뢰도 가중 별점 계산식의 계수 (「신뢰 온도 · 가중 별점 계산식」 2026-11-05, ERD v1.0 rating_param).
// 베타 운영 뒤 DB에서 바로 조정하므로, 이미 있는 행은 덮어쓰지 않는다. GLOBAL_MEAN은 하루 1번 배치가 바꾼다.
const ratingParams = [
  {
    code: 'GLOBAL_MEAN',
    value: 3.8,
    description: '전체 평균 별점 m (하루 1번 갱신, 리뷰가 쌓이기 전 초기값)',
  },
  { code: 'PRIOR_WEIGHT', value: 5, description: '리뷰 수 보정 강도 C' },
  { code: 'TEMP_BASE', value: 50, description: '작성자 가중치 w_user = 1 + (T − 50) / 50' },
  { code: 'HELP_POS', value: 0.5, description: '공감 가중치 계수 (s ≥ 0)' },
  { code: 'HELP_NEG', value: 0.3, description: '공감 가중치 계수 (s < 0)' },
  { code: 'HELP_FULL_COUNT', value: 10, description: '반응이 이 개수부터 공감을 100% 반영 (k)' },
  { code: 'REVISIT_WEIGHT', value: 1.1, description: '재방문 리뷰 가중치 v' },
  { code: 'DECAY_RATE', value: 0.7, description: '시간 감쇠 d = 0.7 ^ n' },
  { code: 'DECAY_MIN', value: 0.3, description: '시간 감쇠 최솟값' },
  { code: 'DECAY_MONTHS', value: 6, description: '시간 감쇠 단위 개월 수' },
  { code: 'TRUST_MIN', value: 0.5, description: 'clamp(w_user × w_help) 하한' },
  { code: 'TRUST_MAX', value: 2.0, description: 'clamp(w_user × w_help) 상한' },
];

async function seedRatingParams(prisma: PrismaClient) {
  for (const param of ratingParams) {
    await prisma.ratingParam.upsert({ where: { code: param.code }, update: {}, create: param });
  }
  return ratingParams.length;
}

// ── ERD v1.2 게임 기본 데이터 (2026-11-05 API 명세서 전체 점검) ─────────────────────────────
// 수치는 초안이다. 운영하면서 DB에서 바로 조정하므로 이미 있는 행은 덮어쓰지 않는다(create만).

/** 레벨 n이 되는 누적 경험치 = Σ(k=1..n-1) (100 + 20 × (k − 1)) — LV.2 100, LV.3 220, LV.10 1,620, LV.20 5,320 */
export function requiredExpOf(level: number) {
  let sum = 0;
  for (let k = 1; k < level; k += 1) sum += 100 + 20 * (k - 1);
  return sum;
}
export const MAX_LEVEL = 30;

/** 성장 단계: E 알(LV.1~2) / B 아기(LV.3~9, 60%) / K 어린이(LV.10~19, 80%) / A 다 큼(LV.20~, 100%) */
function stageOf(level: number) {
  if (level <= 2) return { stage: 'E', sizePercent: 100 };
  if (level <= 9) return { stage: 'B', sizePercent: 60 };
  if (level <= 19) return { stage: 'K', sizePercent: 80 };
  return { stage: 'A', sizePercent: 100 };
}

async function seedLevelPolicies(prisma: PrismaClient) {
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    await prisma.levelPolicy.upsert({
      where: { level },
      update: {},
      create: { level, requiredExp: requiredExpOf(level), ...stageOf(level), rewardPoint: 200 },
    });
  }
  return MAX_LEVEL;
}

// 피그마 "먹포인트 모으는 법"과 디자인 결정사항의 적립 초안
const rewardPolicies = [
  { reason: 'VISIT_VERIFIED', point: 50, exp: 20, dailyLimit: null, description: '방문 인증' },
  {
    reason: 'FIRST_CONQUEST',
    point: 100,
    exp: 30,
    dailyLimit: null,
    description: '새 가게 첫 정복',
  },
  {
    reason: 'REVIEW_DETAIL',
    point: 20,
    exp: 10,
    dailyLimit: null,
    description: '세부평가(세부 별점 5항목)',
  },
  { reason: 'REVIEW_TEXT', point: 30, exp: 20, dailyLimit: null, description: '글 리뷰' },
  { reason: 'REVIEW_PHOTO', point: 20, exp: 10, dailyLimit: null, description: '사진 리뷰' },
  {
    reason: 'HELPFUL_RECEIVED',
    point: 5,
    exp: 2,
    dailyLimit: 20,
    description: '내 리뷰에 도움돼요',
  },
  { reason: 'REVIEW_VOTE', point: 5, exp: 0, dailyLimit: 10, description: '리뷰 평가 참여' },
  { reason: 'LEVEL_UP', point: 200, exp: 0, dailyLimit: null, description: '레벨업' },
  { reason: 'TIER_UP', point: 100, exp: 0, dailyLimit: null, description: '티어 상승' },
  { reason: 'SEASON_REWARD', point: 300, exp: 0, dailyLimit: null, description: '시즌 보상' },
  {
    reason: 'ITEM_BOX',
    point: 100,
    exp: 0,
    dailyLimit: null,
    description: '아이템 상자 (줄 아이템이 없을 때)',
  },
  // 맞춤 퀘스트 (피그마 12, 숫자는 나중에 조정). 보상은 별점 값과 상관없이 준다
  { reason: 'QUEST_EASY', point: 50, exp: 0, dailyLimit: null, description: '퀘스트 완료 (쉬움)' },
  {
    reason: 'QUEST_EXPLORE',
    point: 100,
    exp: 0,
    dailyLimit: null,
    description: '퀘스트 완료 (탐험)',
  },
  {
    reason: 'CREW_TOGETHER',
    point: 100,
    exp: 0,
    dailyLimit: null,
    description: '모임 퀘스트 함께 정복 (각자)',
  },
  {
    reason: 'CREW_SPLIT',
    point: 80,
    exp: 0,
    dailyLimit: null,
    description: '모임 퀘스트 맛집 나눠 찾기 (각자)',
  },
  {
    reason: 'QUEST_CHALLENGE',
    point: 150,
    exp: 0,
    dailyLimit: null,
    description: '퀘스트 완료 (도전)',
  },
];

async function seedRewardPolicies(prisma: PrismaClient) {
  for (const policy of rewardPolicies) {
    await prisma.rewardPolicy.upsert({
      where: { reason: policy.reason },
      update: {},
      create: policy,
    });
  }
  return rewardPolicies.length;
}

// 아이템 (2026-10-06 회의: 모자 6 + 왕관, 얼굴 6, 소품 6, 밤하늘, 방망이 4단계 + 전설). 이름·가격은 피그마 에셋 보드·상점
type ItemSeed = {
  code: string;
  category: 'HAT' | 'FACE' | 'PROP' | 'SKIN' | 'CLUB';
  name: string;
  price?: number;
  unlockType?: 'P' | 'S' | 'M' | 'A' | 'C';
  clubTier?: number;
  description: string;
  /** N 일반(기본) / R 레어 / L 전설 / H 명예 — 피그마 에셋 보드 (v1.3) */
  rarity?: 'N' | 'R' | 'L' | 'H';
  badge?: 'NEW' | 'HOT';
  /** 이 업적을 달성하면 받는다 (v1.3 업적 보상) */
  achievementCode?: string;
};
const items: ItemSeed[] = [
  {
    code: 'HAT_SPROUT',
    category: 'HAT',
    name: '새싹 모자',
    price: 200,
    description: '머리 위에 새싹이 쏙 올라와요.',
  },
  {
    code: 'HAT_STRAWBERRY',
    category: 'HAT',
    name: '딸기 모자',
    price: 300,
    description: '새콤달콤한 딸기 모자예요.',
    badge: 'NEW',
  },
  {
    code: 'HAT_SNAPBACK',
    category: 'HAT',
    name: '스냅백',
    price: 400,
    description: '동네 탐방엔 역시 스냅백.',
  },
  {
    code: 'HAT_BEAR',
    category: 'HAT',
    name: '곰돌이 모자',
    price: 400,
    description: '복슬복슬 곰돌이 귀가 달렸어요.',
    rarity: 'R',
    badge: 'HOT',
  },
  {
    code: 'HAT_CHICK',
    category: 'HAT',
    name: '병아리 모자',
    price: 450,
    description: '삐약삐약 병아리 모자예요.',
  },
  {
    code: 'HAT_ACORN',
    category: 'HAT',
    name: '도토리 모자',
    price: 600,
    description: '가을 숲에서 주운 도토리 모자예요.',
  },
  {
    code: 'HAT_CROWN',
    category: 'HAT',
    name: '왕관',
    unlockType: 'A',
    rarity: 'H',
    achievementCode: 'MUKJJANG',
    description: '구의 먹짱 업적을 달성하면 받아요.',
  },
  {
    code: 'FACE_STAR_STICKER',
    category: 'FACE',
    name: '반짝 별 스티커',
    price: 150,
    description: '볼에 반짝이는 별을 붙여요.',
  },
  {
    code: 'FACE_MUSTACHE',
    category: 'FACE',
    name: '콧수염',
    price: 250,
    description: '맛집 감별사의 콧수염.',
  },
  {
    code: 'FACE_ROUND_GLASSES',
    category: 'FACE',
    name: '동글 안경',
    price: 300,
    description: '동글동글 귀여운 안경이에요.',
  },
  {
    code: 'FACE_HEART_SUNGLASSES',
    category: 'FACE',
    name: '하트 선글라스',
    price: 500,
    description: '하트 모양 선글라스예요.',
    rarity: 'R',
  },
  {
    code: 'FACE_MONOCLE',
    category: 'FACE',
    name: '외알 안경',
    price: 600,
    description: '미식가의 품격, 외알 안경.',
    rarity: 'R',
  },
  {
    code: 'FACE_STAR_SUNGLASSES',
    category: 'FACE',
    name: '별 선글라스',
    price: 700,
    description: '별 모양 선글라스예요.',
    rarity: 'R',
  },
  {
    code: 'PROP_ICE_CREAM',
    category: 'PROP',
    name: '아이스크림',
    price: 250,
    description: '시원한 아이스크림을 들어요.',
  },
  {
    code: 'PROP_HEART_BALLOON',
    category: 'PROP',
    name: '하트 풍선',
    price: 250,
    description: '둥실둥실 하트 풍선이에요.',
  },
  {
    code: 'PROP_TTEOKKKOCHI',
    category: 'PROP',
    name: '떡꼬치',
    price: 300,
    description: '달콤매콤 떡꼬치예요.',
  },
  {
    code: 'PROP_COTTON_CANDY',
    category: 'PROP',
    name: '솜사탕',
    price: 350,
    description: '폭신한 솜사탕이에요.',
  },
  {
    code: 'PROP_FLAG',
    category: 'PROP',
    name: '정복 깃발',
    price: 400,
    description: '정복한 곳에 꽂는 깃발이에요.',
    rarity: 'R',
  },
  {
    code: 'PROP_MIC',
    category: 'PROP',
    name: '마이크',
    price: 450,
    description: '맛집 리뷰는 마이크를 들고.',
    rarity: 'R',
  },
  {
    code: 'SKIN_NIGHTSKY',
    category: 'SKIN',
    name: '밤하늘 먹깨비',
    unlockType: 'A',
    rarity: 'H',
    achievementCode: 'SEASON_TOP10',
    description: '시즌 TOP 10 업적을 달성하면 받아요.',
  },
  {
    code: 'CLUB_WOOD',
    category: 'CLUB',
    name: '나무 방망이',
    unlockType: 'S',
    clubTier: 1,
    description: '시즌에 정복 기록을 남기면 받아요.',
    rarity: 'H',
  },
  {
    code: 'CLUB_BRONZE',
    category: 'CLUB',
    name: '청동 방망이',
    unlockType: 'S',
    clubTier: 2,
    description: '시즌 상위 50% 보상이에요.',
    rarity: 'H',
  },
  {
    code: 'CLUB_SILVER',
    category: 'CLUB',
    name: '은 방망이',
    unlockType: 'S',
    clubTier: 3,
    description: '시즌 상위 30% 보상이에요.',
    rarity: 'H',
  },
  {
    code: 'CLUB_GOLD',
    category: 'CLUB',
    name: '황금 방망이',
    unlockType: 'S',
    clubTier: 4,
    description: '시즌 상위 10% 보상이에요. 3개를 모으면 전설의 방망이로 합칠 수 있어요.',
    rarity: 'H',
    achievementCode: 'SEASON_CONQUEST_30',
  },
  {
    code: 'CLUB_LEGEND',
    category: 'CLUB',
    name: '전설의 방망이',
    unlockType: 'M',
    clubTier: 5,
    description: '황금 방망이 3개를 합쳐 만들어요.',
    rarity: 'L',
  },
  // 맞춤 퀘스트·모임 보상 (2026-11-12). 이미 넣은 아이템의 sort_order와 겹치지 않게 맨 뒤에 둔다
  {
    code: 'PROP_EXPLORER_BAG',
    category: 'PROP',
    name: '탐험가 배낭',
    unlockType: 'A',
    rarity: 'H',
    achievementCode: 'QUEST_STREAK_4',
    description: '4주 연속 이번 주 퀘스트를 모두 깨면 받아요.',
  },
  {
    code: 'HAT_CREW',
    category: 'HAT',
    name: '모임 단체 모자',
    unlockType: 'C',
    rarity: 'H',
    description: '모임에서 함께 정복 10곳을 채우면 모임원 모두 받아요.',
  },
];

async function seedItems(prisma: PrismaClient) {
  for (const [index, item] of items.entries()) {
    await prisma.item.upsert({
      where: { code: item.code },
      update: {},
      create: {
        code: item.code,
        category: item.category,
        name: item.name,
        description: item.description,
        price: item.price ?? null,
        unlockType: item.unlockType ?? 'P',
        rarity: item.rarity ?? 'N',
        badge: item.badge ?? null,
        clubTier: item.clubTier ?? null,
        sortOrder: index + 1,
      },
    });
  }
  const id = async (code: string) =>
    (await prisma.item.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;

  const legend = await id('CLUB_LEGEND');
  const gold = await id('CLUB_GOLD');
  await prisma.itemRecipe.upsert({
    where: { resultItemId: legend },
    update: {},
    create: { resultItemId: legend, materialItemId: gold, materialCount: 3 },
  });

  // 시즌 보상표: 방망이 4단계만, 걸린 것 중 가장 좋은 1개 (v1.3 — 왕관·밤하늘은 업적 보상으로 옮김, 피그마 "시즌 보상 — 도깨비 방망이")
  const rules = [
    { ruleType: 'P', threshold: 10, code: 'CLUB_GOLD' },
    { ruleType: 'P', threshold: 30, code: 'CLUB_SILVER' },
    { ruleType: 'P', threshold: 50, code: 'CLUB_BRONZE' },
    { ruleType: 'P', threshold: 100, code: 'CLUB_WOOD' },
  ];
  for (const rule of rules) {
    const itemId = await id(rule.code);
    await prisma.seasonRewardRule.upsert({
      where: {
        ruleType_threshold_itemId: { ruleType: rule.ruleType, threshold: rule.threshold, itemId },
      },
      update: {},
      create: { ruleType: rule.ruleType, threshold: rule.threshold, itemId },
    });
  }
  return items.length;
}

// 업적 12개 (피그마 탐방러 프로필 / 업적 전체). 업적 이름이 칭호로도 쓰인다(RANK-11)
const achievements = [
  {
    code: 'FIRST_CONQUEST',
    name: '첫 정복',
    description: '처음으로 맛집을 정복했어요',
    conditionType: 'CONQUEST_TOTAL',
    conditionValue: 1,
    rewardPoint: 50,
  },
  {
    code: 'REGULAR_START',
    name: '단골의 시작',
    description: '한 구에서 5곳 정복',
    conditionType: 'SIGUNGU_CONQUEST',
    conditionValue: 5,
    rewardPoint: 100,
  },
  {
    code: 'REVIEW_10',
    name: '리뷰 10개',
    description: '글 리뷰 10개 쓰기',
    conditionType: 'REVIEW_TEXT_COUNT',
    conditionValue: 10,
    rewardPoint: 100,
  },
  {
    code: 'PHOTO_REVIEW_5',
    name: '사진 리뷰 5개',
    description: '사진 리뷰 5개 쓰기',
    conditionType: 'REVIEW_PHOTO_COUNT',
    conditionValue: 5,
    rewardPoint: 100,
  },
  {
    code: 'DISTRICT_3',
    name: '3개 구 탐험',
    description: '서로 다른 3개 구에서 정복',
    conditionType: 'DISTRICT_COUNT',
    conditionValue: 3,
    rewardPoint: 100,
  },
  {
    code: 'REVIEW_50',
    name: '리뷰 50개',
    description: '글 리뷰 50개 쓰기',
    conditionType: 'REVIEW_TEXT_COUNT',
    conditionValue: 50,
    rewardPoint: 300,
  },
  {
    code: 'DISTRICT_5',
    name: '5개 구 탐험',
    description: '서로 다른 5개 구에서 정복',
    conditionType: 'DISTRICT_COUNT',
    conditionValue: 5,
    rewardPoint: 200,
  },
  {
    code: 'WEEKLY_STREAK_4',
    name: '4주 연속 정복',
    description: '4주 동안 매주 1곳 이상 정복',
    conditionType: 'WEEKLY_STREAK',
    conditionValue: 4,
    rewardPoint: 200,
  },
  {
    code: 'HELPFUL_300',
    name: '도움왕',
    description: '도움돼요 300개 받기',
    conditionType: 'HELPFUL_RECEIVED',
    conditionValue: 300,
    rewardPoint: 300,
  },
  {
    code: 'SEASON_CONQUEST_30',
    name: '한 시즌 30곳 정복',
    description: '한 시즌에 30곳 정복',
    conditionType: 'SEASON_CONQUEST',
    conditionValue: 30,
    rewardPoint: 300,
  },
  {
    code: 'SEASON_TOP10',
    name: '시즌 TOP 10',
    description: '시즌이 끝났을 때 한 구에서 10위 안',
    conditionType: 'SEASON_RANK',
    conditionValue: 10,
    rewardPoint: 300,
  },
  {
    code: 'MUKJJANG',
    name: '구의 먹짱',
    description: '시즌이 끝났을 때 한 구에서 1위',
    conditionType: 'SEASON_RANK',
    conditionValue: 1,
    rewardPoint: 500,
  },
  // 맞춤 퀘스트 (2026-11-10). 이미 넣은 업적의 sort_order와 겹치지 않게 맨 뒤에 둔다
  {
    code: 'QUEST_STREAK_4',
    name: '꾸준한 탐험가',
    description: '4주 연속 이번 주 퀘스트를 모두 완료',
    conditionType: 'QUEST_STREAK',
    conditionValue: 4,
    rewardPoint: 200,
  },
  {
    code: 'QUEST_PLACES_10',
    name: '새 맛 수집가',
    description: '퀘스트로 서로 다른 가게 10곳 정복',
    conditionType: 'QUEST_PLACES',
    conditionValue: 10,
    rewardPoint: 200,
  },
];

async function seedAchievements(prisma: PrismaClient) {
  for (const [index, a] of achievements.entries()) {
    await prisma.achievement.upsert({
      where: { code: a.code },
      update: {},
      create: { ...a, iconKey: `ACH_${a.code}`, sortOrder: index + 1 },
    });
  }
  // 업적 보상 아이템 (v1.3): 업적을 달성하면 그 업적이 걸린 아이템을 준다. 이미 연결된 아이템은 건드리지 않는다
  for (const item of items.filter((i) => i.achievementCode)) {
    const achievement = await prisma.achievement.findUniqueOrThrow({
      where: { code: item.achievementCode },
      select: { id: true },
    });
    await prisma.item.updateMany({
      where: { code: item.code, requiredAchievementId: null },
      data: { requiredAchievementId: achievement.id },
    });
  }
  return achievements.length;
}

// 아이템 세트 (v1.3, 피그마 상점 배너)
const itemSets = [
  {
    code: 'SET_STRAWBERRY',
    name: '딸기 모자 세트',
    description: '딸기 모자 + 하트 풍선을 함께!',
    price: 450,
    badge: 'NEW',
    itemCodes: ['HAT_STRAWBERRY', 'PROP_HEART_BALLOON'],
  },
];

async function seedItemSets(prisma: PrismaClient) {
  for (const [index, { itemCodes, ...set }] of itemSets.entries()) {
    const existing = await prisma.itemSet.findUnique({ where: { code: set.code } });
    if (existing) continue;
    const itemIds = await prisma.item.findMany({
      where: { code: { in: itemCodes } },
      select: { id: true },
    });
    await prisma.itemSet.create({
      data: {
        ...set,
        sortOrder: index + 1,
        items: { create: itemIds.map((i) => ({ itemId: i.id })) },
      },
    });
  }
  return itemSets.length;
}

// 좋았던 점·아쉬웠던 점 칩 (2026-11-04 초안, 문구는 팀 확정 전)
const reviewAspects = [
  { code: 'TASTE', name: '맛' },
  { code: 'PORTION', name: '양' },
  { code: 'PRICE', name: '가격' },
  { code: 'SERVICE', name: '서비스' },
  { code: 'CLEAN', name: '청결' },
  { code: 'WAIT', name: '대기시간' },
  { code: 'MOOD', name: '분위기' },
];

async function seedReviewAspects(prisma: PrismaClient) {
  for (const [index, aspect] of reviewAspects.entries()) {
    await prisma.reviewAspect.upsert({
      where: { code: aspect.code },
      update: {},
      create: { ...aspect, sortOrder: index + 1 },
    });
  }
  return reviewAspects.length;
}

/** 시즌 1~3 (디자인 결정사항: 시즌 1 2025.9~2026.2, 시즌 2 2026.3~8, 시즌 3 2026.9~2027.2). 배포·로컬 seed에서만 쓴다(테스트는 시즌을 직접 만든다) */
export async function seedSeasons(prisma: PrismaClient) {
  const seasons = [
    { seasonNo: 1, startDate: '2025-09-01', endDate: '2026-02-28', status: 'F' },
    { seasonNo: 2, startDate: '2026-03-01', endDate: '2026-08-31', status: 'F' },
    { seasonNo: 3, startDate: '2026-09-01', endDate: '2027-02-28', status: 'A' },
  ];
  for (const season of seasons) {
    await prisma.season.upsert({
      where: { seasonNo: season.seasonNo },
      update: {},
      create: {
        ...season,
        startDate: new Date(`${season.startDate}T00:00:00Z`),
        endDate: new Date(`${season.endDate}T00:00:00Z`),
        finalizedAt: season.status === 'F' ? new Date(`${season.endDate}T15:00:00Z`) : null,
      },
    });
  }
  return seasons.length;
}

/** 기본 데이터를 모두 넣고 넣은 개수를 돌려준다 */
export async function seedBaseData(prisma: PrismaClient) {
  const categoryCount = await seedCategories(prisma);
  const policyDocumentCreated = await seedPolicyDocuments(prisma);
  const regions = await seedRegions(prisma);
  const ratingParamCount = await seedRatingParams(prisma);
  const levelCount = await seedLevelPolicies(prisma);
  const rewardPolicyCount = await seedRewardPolicies(prisma);
  const itemCount = await seedItems(prisma);
  const achievementCount = await seedAchievements(prisma);
  const itemSetCount = await seedItemSets(prisma);
  const reviewAspectCount = await seedReviewAspects(prisma);
  return {
    categoryCount,
    policyDocumentCreated,
    ...regions,
    ratingParamCount,
    levelCount,
    rewardPolicyCount,
    itemCount,
    achievementCount,
    itemSetCount,
    reviewAspectCount,
  };
}
