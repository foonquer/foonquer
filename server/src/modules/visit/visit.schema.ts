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
export const onSiteBody = z.object({
  sitePhotoKey: z.string().min(1).max(255),
  photoTakenAt: z.iso.datetime({ offset: true }).optional(),
  photoLat: lat.optional(),
  photoLng: lng.optional(),
});
export type OnSiteBody = z.infer<typeof onSiteBody>;

/** VISIT-03 */
export const receiptBody = z.object({
  restaurantId: z.number().int().positive(),
  receiptImageKey: z.string().min(1).max(255),
});
export type ReceiptBody = z.infer<typeof receiptBody>;
