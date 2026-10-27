import type { PrismaClient } from '../src/generated/prisma/client';
import { SEOUL, SEOUL_DONG, SEOUL_SIGUNGU } from '../src/modules/region/seoul-regions';

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
// 본문은 초안 자리표시다. 실제 문구는 약관 조회(CS-07) 담당과 정해서 새 version 행으로 추가하고,
// 이미 있는 행은 덮어쓰지 않는다(동의 기록이 가리키는 버전의 내용이 바뀌면 안 되므로).
const FIRST_POLICY_VERSION = '2026-09-01';
const policyDocuments = [
  { type: 'TERMS', title: '서비스 이용약관' },
  { type: 'PRIVACY', title: '개인정보 수집·이용 동의' },
  { type: 'LOCATION', title: '위치기반 서비스 이용약관' },
] as const;

async function seedPolicyDocuments(prisma: PrismaClient) {
  let created = 0;
  for (const doc of policyDocuments) {
    const exists = await prisma.policyDocument.findUnique({
      where: { type_version: { type: doc.type, version: FIRST_POLICY_VERSION } },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.policyDocument.create({
      data: {
        type: doc.type,
        version: FIRST_POLICY_VERSION,
        content: `${doc.title} (초안)\n\n본문은 준비 중입니다.`,
        effectiveDate: new Date(`${FIRST_POLICY_VERSION}T00:00:00Z`),
      },
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

/** 기본 데이터를 모두 넣고 넣은 개수를 돌려준다 */
export async function seedBaseData(prisma: PrismaClient) {
  const categoryCount = await seedCategories(prisma);
  const policyDocumentCreated = await seedPolicyDocuments(prisma);
  const regions = await seedRegions(prisma);
  return { categoryCount, policyDocumentCreated, ...regions };
}
