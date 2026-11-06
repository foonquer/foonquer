import { z } from 'zod';

const lat = z
  .number({ error: 'INVALID_COORDINATE' })
  .min(33, { error: 'INVALID_COORDINATE' })
  .max(39, { error: 'INVALID_COORDINATE' });
const lng = z
  .number({ error: 'INVALID_COORDINATE' })
  .min(124, { error: 'INVALID_COORDINATE' })
  .max(132, { error: 'INVALID_COORDINATE' });

export const verificationParams = z.object({
  verificationId: z.coerce.number().int().positive(),
});

/** VISIT-01 */
export const locationCheckBody = z.object({
  restaurantId: z.number().int().positive(),
  lat,
  lng,
  /** GPS 정확도(m) */
  accuracyM: z.number().int().min(0).max(5000).optional(),
});
export type LocationCheckBody = z.infer<typeof locationCheckBody>;

/** VISIT-02 — 갤러리 사진의 EXIF는 프론트가 읽어서 보낸다 (브라우저가 지우면 없음) */
// 사진 위치는 한국 밖일 수도 있어서 범위만 보고(가게와 멀면 서비스에서 PHOTO_MISMATCH), 위도·경도는 함께 보낸다
const COORD_ERROR = { error: 'INVALID_COORDINATE' } as const;
export const onSiteBody = z
  .object({
    sitePhotoKey: z.string().min(1).max(255),
    photoTakenAt: z.iso.datetime({ offset: true }).optional(),
    photoLat: z.number(COORD_ERROR).min(-90, COORD_ERROR).max(90, COORD_ERROR).optional(),
    photoLng: z.number(COORD_ERROR).min(-180, COORD_ERROR).max(180, COORD_ERROR).optional(),
  })
  .refine((b) => (b.photoLat === undefined) === (b.photoLng === undefined), COORD_ERROR);
export type OnSiteBody = z.infer<typeof onSiteBody>;

/** VISIT-03 */
export const receiptBody = z.object({
  /** 없으면 홈에서 바로 찍은 영수증: OCR로 후보 가게를 찾아 "이 가게가 맞나요?"(status R) */
  restaurantId: z.number().int().positive().optional(),
  receiptImageKey: z.string().min(1).max(255),
});
export type ReceiptBody = z.infer<typeof receiptBody>;

/** VISIT-04 — 가게 확인 대기(R)일 때 후보 가게를 내 위치에서 가까운 순으로 */
export const verificationQuery = z
  .object({
    lat: z.coerce.number().pipe(lat).optional(),
    lng: z.coerce.number().pipe(lng).optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), COORD_ERROR);
export type VerificationQuery = z.infer<typeof verificationQuery>;

/** VISIT-05 */
export const restaurantConfirmBody = z.object({ restaurantId: z.number().int().positive() });
export type RestaurantConfirmBody = z.infer<typeof restaurantConfirmBody>;
