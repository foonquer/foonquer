// 먹깨비·상점·먹포인트 API (CHAR-01~10, SHOP-01~04, POINT-02)

import { api } from '../lib/api';
import type { Page } from './reviews';

export type ItemCategory = 'HAT' | 'FACE' | 'PROP' | 'SKIN' | 'CLUB';
/** N 일반 / R 레어 / E 에픽 / L 전설 / H 명예 */
export type Rarity = 'N' | 'R' | 'E' | 'L' | 'H';
export type Stage = 'EGG' | 'BABY' | 'KID' | 'ADULT';

export const CATEGORY_NAME: Record<ItemCategory, string> = {
  HAT: '모자',
  FACE: '얼굴',
  PROP: '소품',
  SKIN: '먹깨비',
  CLUB: '방망이',
};
export const RARITY_NAME: Record<Rarity, string> = {
  N: '일반',
  R: '레어',
  E: '에픽',
  L: '전설',
  H: '명예',
};

type ItemRef = { itemId: number; code: string; name: string } | null;

export type MyMukkaebi = {
  level: number;
  exp: number;
  levelExp: number;
  nextLevelExp: number | null;
  stage: Stage;
  stageName: string;
  sizePercent: number;
  equipped: { hat: ItemRef; face: ItemRef; prop: ItemRef; skin: ItemRef; club: ItemRef };
  background: { sigunguId: number; sigunguName: string; bgKey: string | null } | null;
  currentRestaurant: { restaurantId: number; name: string; lat: number; lng: number } | null;
  pointBalance: number;
  newItemCount: number;
  unopenedBoxCount: number;
};

/** CHAR-01 내 먹깨비 */
export const getMyMukkaebi = () => api.get<MyMukkaebi>('/characters/me');

export type OwnedItem = {
  itemId: number;
  code: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  quantity: number;
  isNew: boolean;
  isEquipped: boolean;
  acquiredAt: string;
};

export type OwnedBackground = {
  sigunguId: number;
  sigunguName: string;
  bgKey: string | null;
  isSelected: boolean;
  unlockedAt: string;
};

/** CHAR-02 보유 아이템 (조회하면 "새로 얻음" 표시가 꺼진다) */
export const getMyItems = () =>
  api.get<{ items: OwnedItem[]; backgrounds: OwnedBackground[] }>('/characters/me/items');

export type Appearance = {
  hatItemId?: number | null;
  faceItemId?: number | null;
  propItemId?: number | null;
  skinItemId?: number | null;
  clubItemId?: number | null;
  bgSigunguId?: number | null;
};

/** CHAR-03 꾸미기 저장 (보낸 칸만, null이면 해제) */
export const saveAppearance = (body: Appearance) =>
  api.put<Pick<MyMukkaebi, 'equipped' | 'background'>>('/characters/me/appearance', body);

/** CHAR-07 도감 */
export const getCollection = () =>
  api.get<{
    collectedCount: number;
    totalCount: number;
    stages: {
      stage: Stage;
      name: string;
      fromLevel: number | null;
      reached: boolean;
      isCurrent: boolean;
    }[];
    items: {
      itemId: number;
      code: string;
      name: string;
      category: ItemCategory;
      rarity: Rarity;
      owned: boolean;
      howToGet: string | null;
    }[];
    backgrounds: {
      sigunguId: number;
      sigunguName: string;
      bgKey: string | null;
      unlocked: boolean;
    }[];
    nextGoal: { itemId: number; name: string; price: number | null } | null;
  }>('/characters/me/collection');

/** CHAR-10 합성 (황금 방망이 3개 → 전설의 방망이) */
export const craftItem = (itemId: number) =>
  api.post<{
    item: { itemId: number; code: string; name: string; quantity: number };
    material: { itemId: number; name: string; quantity: number };
  }>(`/characters/me/items/${itemId}/craft`);

export type ItemBox = {
  boxId: number;
  title: string;
  opened: boolean;
  receivedAt: string;
  openedAt: string | null;
  resultItem: {
    itemId: number;
    code: string;
    name: string;
    category: ItemCategory;
    rarity: Rarity;
  } | null;
  resultPoint: number | null;
};

/** CHAR-05 내 아이템 상자 (안 연 것 먼저) */
export const getItemBoxes = () =>
  api.get<{ unopenedCount: number; items: ItemBox[] }>('/characters/me/item-boxes');

/** CHAR-06 아이템 상자 열기 — 아직 없는 모자·얼굴·소품 하나 (다 가졌으면 먹포인트) */
export const openItemBox = (boxId: number) =>
  api.post<{
    boxId: number;
    item: {
      itemId: number;
      code: string;
      name: string;
      category: ItemCategory;
      rarity: Rarity;
      price: number | null;
    } | null;
    point: number | null;
    unopenedCount: number;
  }>(`/characters/me/item-boxes/${boxId}/open`);

export type Celebration =
  | {
      celebrationId: string;
      type: 'LEVEL_UP';
      occurredAt: string;
      data: {
        fromLevel: number;
        toLevel: number;
        stage: Stage;
        stageName: string;
        itemBoxCount: number;
      };
    }
  | {
      celebrationId: string;
      type: 'TIER_UP';
      occurredAt: string;
      data: { sigunguId: number; sigunguName: string; tierTitle: string; rank: number | null };
    }
  | {
      celebrationId: string;
      type: 'BACKGROUND';
      occurredAt: string;
      data: { sigunguId: number; sigunguName: string };
    }
  | {
      celebrationId: string;
      type: 'ACHIEVEMENT';
      occurredAt: string;
      data: { name: string; description: string | null; rewardPoint: number };
    }
  | {
      celebrationId: string;
      type: 'SEASON_RESULT';
      occurredAt: string;
      data: {
        seasonNo: number;
        tierTitle: string;
        rank: number | null;
        conquestTotal: number;
        rewardPoint: number;
        rewardClubItem: { code: string; name: string } | null;
      };
    };

/** CHAR-08 아직 보지 않은 축하 (오래된 순) */
export const getCelebrations = () => api.get<{ items: Celebration[] }>('/users/me/celebrations');

/** CHAR-09 축하 확인 (다시 뜨지 않게) */
export const markCelebrationSeen = (celebrationId: string) =>
  api.patch<unknown>(`/users/me/celebrations/${encodeURIComponent(celebrationId)}/seen`);

export type ShopCategory = 'HAT' | 'FACE' | 'PROP' | 'HONOR';

export type ShopItem = {
  itemId: number;
  code: string;
  name: string;
  description: string | null;
  category: ItemCategory;
  rarity: Rarity;
  price: number | null;
  badge: string | null;
  purchasable: boolean;
  owned: boolean;
  equipped: boolean;
  /** 명예 아이템을 얻는 방법 */
  unlockCondition: string | null;
  requiredAchievement: { achievementId: number; name: string } | null;
};

export type ShopSet = {
  setId: number;
  code: string;
  name: string;
  description: string | null;
  price: number;
  /** 따로 사면 (취소선 가격) */
  originalPrice: number;
  badge: string | null;
  items: {
    itemId: number;
    code: string;
    name: string;
    category: ItemCategory;
    rarity: Rarity;
    owned: boolean;
  }[];
  purchasable: boolean;
  canBuy: boolean;
};

/** SHOP-01 상점 목록 + 세트 배너 */
export const getShopItems = (category: ShopCategory) =>
  api.get<{ category: ShopCategory; pointBalance: number; sets: ShopSet[]; items: ShopItem[] }>(
    '/shop/items',
    { category },
  );

/** SHOP-03 구매 (equipNow면 바로 착용) */
export const purchaseItem = (itemId: number, equipNow = false) =>
  api.post<{
    itemId: number;
    name: string;
    price: number;
    pointBalance: number;
    equipped: boolean;
  }>('/shop/purchases', { itemId, equipNow });

/** SHOP-04 세트 구매 */
export const purchaseSet = (setId: number, equipNow = false) =>
  api.post<{ setId: number; name: string; price: number; pointBalance: number; equipped: boolean }>(
    '/shop/set-purchases',
    { setId, equipNow },
  );

export type PointHistory = {
  pointHistoryId: number;
  amount: number;
  balanceAfter: number;
  reason: string;
  title: string;
  date: string;
  regDate: string;
};

/** POINT-02 먹포인트 내역 (최신순) */
export const getPointHistory = (query: {
  type: 'ALL' | 'EARN' | 'SPEND';
  page?: number;
  size?: number;
}) => api.get<Page<PointHistory>>('/points/me/history', query);
