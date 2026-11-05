import { z } from 'zod';
import { pageQuery } from '../../common/pagination';

export const memberParams = z.object({ userId: z.coerce.number().int().positive() });

/** PROFILE-02 다녀온 가게 */
export const visitedQuery = z.object({
  ...pageQuery,
  seasonId: z.coerce.number().int().positive().optional(),
  sigunguId: z.coerce.number().int().positive().optional(),
});
export type VisitedQuery = z.infer<typeof visitedQuery>;

/** PICK-01 고를 수 있는 가게 검색 */
export const pickCandidateQuery = z.object({
  ...pageQuery,
  keyword: z.string().trim().max(30).optional(),
});
export type PickCandidateQuery = z.infer<typeof pickCandidateQuery>;

export const MAX_PICKS = 10;

/** PICK-02 순서대로 통째로 저장 */
export const picksBody = z.object({
  picks: z
    .array(
      z.object({
        restaurantId: z.number().int().positive(),
        comment: z
          .string()
          .trim()
          .max(30, { error: 'PICK_COMMENT_TOO_LONG' })
          .nullable()
          .optional(),
      }),
    )
    .max(MAX_PICKS, { error: 'TOO_MANY_PICKS' })
    .refine((list) => new Set(list.map((p) => p.restaurantId)).size === list.length, {
      error: 'PICK_DUPLICATE',
    }),
});
export type PicksBody = z.infer<typeof picksBody>;

/** REPORT-01 */
export const reportBody = z.object({
  targetType: z.enum(['REVIEW', 'MEMBER'], { error: 'INVALID_REPORT' }),
  targetId: z.number({ error: 'INVALID_REPORT' }).int().positive(),
  reason: z.enum(['SPAM', 'AD', 'ABUSE', 'FAKE', 'PRIVACY', 'ETC'], { error: 'INVALID_REPORT' }),
  detail: z.string().trim().max(200, { error: 'REPORT_DETAIL_TOO_LONG' }).nullable().optional(),
});
export type ReportBody = z.infer<typeof reportBody>;

export const blockListQuery = z.object({ ...pageQuery });
export type BlockListQuery = z.infer<typeof blockListQuery>;
