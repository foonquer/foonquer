import { z } from 'zod';

export const MAPAE_EVENT_TYPES = ['STAR5', 'SERVICE', 'RECEIPT', 'ETC'] as const;
export const OWNER_RELATIONS = ['OWNER', 'MANAGER'] as const;
export const OBJECTION_REASONS = ['ENDED', 'NEVER', 'ETC'] as const;

const COORD_ERROR = { error: 'INVALID_COORDINATE' } as const;

export const mapaeRestaurantParams = z.object({
  restaurantId: z.coerce.number().int().positive(),
});
export const mapaeReportParams = z.object({ reportId: z.coerce.number().int().positive() });

/** MAPAE-01 — 사진은 앱 카메라로 가게에서 찍고(UPLOAD-01 purpose MAPAE), 위치는 그때 잰 내 위치 */
export const mapaeReportBody = z.object({
  eventType: z.enum(MAPAE_EVENT_TYPES, { error: 'INVALID_MAPAE_EVENT_TYPE' }),
  memo: z.string().trim().max(200).nullable().optional(),
  photoKey: z.string().min(1).max(255),
  lat: z.number(COORD_ERROR).min(-90, COORD_ERROR).max(90, COORD_ERROR),
  lng: z.number(COORD_ERROR).min(-180, COORD_ERROR).max(180, COORD_ERROR),
});
export type MapaeReportBody = z.infer<typeof mapaeReportBody>;

/** MAPAE-03 사장님 이의제기 — 1:1 문의(category MAPAE)로 접수 */
export const mapaeObjectionBody = z.object({
  relation: z.enum(OWNER_RELATIONS, { error: 'INVALID_OWNER_RELATION' }),
  reason: z.enum(OBJECTION_REASONS, { error: 'INVALID_OBJECTION_REASON' }),
  content: z
    .string({ error: 'OBJECTION_CONTENT_REQUIRED' })
    .trim()
    .min(1, { error: 'OBJECTION_CONTENT_REQUIRED' })
    .max(1000, { error: 'OBJECTION_CONTENT_REQUIRED' }),
  imageKey: z.string().min(1).max(255).nullable().optional(),
});
export type MapaeObjectionBody = z.infer<typeof mapaeObjectionBody>;
