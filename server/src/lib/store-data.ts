import { env } from '../config/env';

/**
 * 공공데이터포털 소상공인시장진흥공단 상가(상권)정보 API (https://www.data.go.kr/data/15012005/openapi.do).
 * 이용허락범위 제한이 없어 가게 기본 정보(상호·업종·주소·좌표)를 DB에 저장해도 된다.
 * 인증키는 서버 환경변수 DATA_GO_KR_SERVICE_KEY에만 둔다 (요청 URL에 들어가므로 URL을 로그에 남기지 않는다).
 */

const BASE_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/';
const TIMEOUT_MS = 30_000;
/** 한 페이지 최대 행 수 */
const PAGE_SIZE = 1000;
/** 상권업종 대분류 "음식" */
const FOOD_LARGE_CODE = 'I2';

export class StoreDataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StoreDataError';
  }
}

/** 상가업소 한 곳 (필요한 필드만) */
export interface PublicStore {
  /** 상가업소번호 */
  bizesId: string;
  /** 상호명 */
  bizesNm: string;
  /** 지점명 */
  brchNm?: string | null;
  /** 상권업종 소분류 코드·이름. 예) I20105 국수/칼국수 */
  indsSclsCd: string;
  indsSclsNm: string;
  /** 법정동 코드 (10자리) */
  ldongCd: string;
  /** 지번 주소 */
  lnoAdr?: string | null;
  /** 도로명 주소 */
  rdnmAdr?: string | null;
  /** 경도 */
  lon: string | number;
  /** 위도 */
  lat: string | number;
}

interface StoreListBody {
  header?: { resultCode?: string; resultMsg?: string };
  body?: {
    items?: PublicStore[] | { item?: PublicStore[] | PublicStore };
    totalCount?: number | string;
  };
}

/** 포털에서 받은 Encoding 키(%가 들어 있음)를 넣어도 되게 한 번 푼다 (URLSearchParams가 다시 인코딩한다) */
function serviceKey() {
  const key = env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new StoreDataError('DATA_GO_KR_SERVICE_KEY 환경변수가 없습니다.');
  return key.includes('%') ? decodeURIComponent(key) : key;
}

async function storeList(params: Record<string, string | number>) {
  const url = new URL('storeListInDong', BASE_URL);
  url.searchParams.set('serviceKey', serviceKey());
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));

  let text: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    text = await res.text();
    if (!res.ok) throw new StoreDataError(`상가정보 응답 ${res.status}: ${text.slice(0, 200)}`);
  } catch (err) {
    if (err instanceof StoreDataError) throw err;
    throw new StoreDataError('상가정보 요청 실패', { cause: err });
  }
  // 인증키 오류 등은 type=json이어도 XML로 온다
  let json: StoreListBody & { response?: StoreListBody };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new StoreDataError(`상가정보 응답을 읽지 못했습니다: ${text.slice(0, 200)}`);
  }
  const { header, body } = json.response ?? json;
  // 03: 결과 없음
  if (header?.resultCode === '03') return { items: [], totalCount: 0 };
  if (header?.resultCode !== '00') {
    throw new StoreDataError(`상가정보 오류 ${header?.resultCode}: ${header?.resultMsg ?? ''}`);
  }
  const raw = Array.isArray(body?.items) ? body.items : (body?.items?.item ?? []);
  return { items: Array.isArray(raw) ? raw : [raw], totalCount: Number(body?.totalCount ?? 0) };
}

/**
 * 시군구(법정동 코드 앞 5자리) 안의 음식 업종 상가 전부.
 * 끝까지 읽지 못하면 에러 (일부만 받고 나머지를 폐업으로 처리하지 않게).
 */
export async function fetchFoodStoresInSigungu(sigunguCode: string): Promise<PublicStore[]> {
  const stores: PublicStore[] = [];
  for (let pageNo = 1; ; pageNo += 1) {
    const { items, totalCount } = await storeList({
      divId: 'signguCd',
      key: sigunguCode,
      indsLclsCd: FOOD_LARGE_CODE,
      numOfRows: PAGE_SIZE,
      pageNo,
      type: 'json',
    });
    stores.push(...items);
    if (items.length < PAGE_SIZE || stores.length >= totalCount) {
      if (stores.length < totalCount) {
        throw new StoreDataError(`상가정보를 ${totalCount}곳 중 ${stores.length}곳만 받았습니다.`);
      }
      return stores;
    }
  }
}
