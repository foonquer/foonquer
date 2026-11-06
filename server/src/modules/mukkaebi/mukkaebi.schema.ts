import { z } from 'zod';
import { pageQuery } from '../../common/pagination';

const slot = z.number().int().positive().nullable().optional();

/** CHAR-03 꾸미기 저장 — 보낸 칸만 바꾸고 null이면 해제 */
export const appearanceBody = z.object({
  hatItemId: slot,
  faceItemId: slot,
  propItemId: slot,
  skinItemId: slot,
  clubItemId: slot,
  bgSigunguId: slot,
});
export type AppearanceBody = z.infer<typeof appearanceBody>;

export const itemCategoryQuery = z.object({
  category: z
    .enum(['HAT', 'FACE', 'PROP', 'SKIN', 'CLUB', 'BACKGROUND'], { error: 'INVALID_ITEM_CATEGORY' })
    .optional(),
});
export type ItemCategoryQuery = z.infer<typeof itemCategoryQuery>;

export const itemParams = z.object({ itemId: z.coerce.number().int().positive() });
/** LEVEL_UP:{레벨 1~3자리} / 나머지:{id 1~18자리, BIGINT 범위 안} — 범위를 넘는 숫자가 DB 오류(500)가 되지 않게 */
export const celebrationParams = z.object({
  celebrationId: z
    .string()
    .regex(
      /^(LEVEL_UP:[1-9]\d{0,2}|(TIER_UP|BACKGROUND|ACHIEVEMENT|SEASON_RESULT):[1-9]\d{0,17})$/,
      {
        error: 'CELEBRATION_NOT_FOUND',
      },
    ),
});

/** SHOP-01 — HONOR는 명예 아이템(왕관·밤하늘·방망이) */
export const shopQuery = z.object({
  category: z
    .enum(['HAT', 'FACE', 'PROP', 'HONOR'], { error: 'INVALID_ITEM_CATEGORY' })
    .default('HAT'),
});
export type ShopQuery = z.infer<typeof shopQuery>;

/** SHOP-03 */
export const purchaseBody = z.object({
  itemId: z.number().int().positive(),
  equipNow: z.boolean().optional(),
});
export type PurchaseBody = z.infer<typeof purchaseBody>;

/** POINT-02 */
export const pointHistoryQuery = z.object({
  ...pageQuery,
  type: z.enum(['ALL', 'EARN', 'SPEND'], { error: 'VALIDATION_ERROR' }).default('ALL'),
});
export type PointHistoryQuery = z.infer<typeof pointHistoryQuery>;
