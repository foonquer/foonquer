import { z } from 'zod';
import { pageQuery } from '../../common/pagination';

const seasonId = z.coerce.number().int().positive().optional();

export const seasonQuery = z.object({ seasonId });
export type SeasonQuery = z.infer<typeof seasonQuery>;

export const sigunguParams = z.object({ sigunguId: z.coerce.number().int().positive() });

export const sigunguDetailQuery = z.object({ seasonId, ...pageQuery });
export type SigunguDetailQuery = z.infer<typeof sigunguDetailQuery>;

export const mukjjangMapQuery = z.object({
  seasonId,
  sigunguId: z.coerce.number().int().positive().optional(),
});
export type MukjjangMapQuery = z.infer<typeof mukjjangMapQuery>;

/** RANK-09 — type null이면 대표 칭호를 해제한다 */
export const representativeTitleBody = z
  .object({
    type: z.enum(['ACHIEVEMENT', 'TIER'], { error: 'INVALID_TITLE' }).nullable(),
    refId: z.number({ error: 'INVALID_TITLE' }).int().positive().nullable().optional(),
  })
  .refine((b) => (b.type === null ? !b.refId : Boolean(b.refId)), { error: 'INVALID_TITLE' });
export type RepresentativeTitleBody = z.infer<typeof representativeTitleBody>;
