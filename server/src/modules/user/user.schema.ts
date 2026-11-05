import { z } from 'zod';
import { nicknameProblem } from './nickname';

const nicknameField = z
  .string({ error: 'INVALID_NICKNAME' })
  .trim()
  .refine((n) => nicknameProblem(n) === null, { error: 'INVALID_NICKNAME' });

const genderField = z.enum(['F', 'M', 'N'], { error: 'INVALID_GENDER' });

const ageGroupField = z.union(
  [z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50)],
  { error: 'INVALID_AGE_GROUP' },
);

/** USER-01 */
export const nicknameAvailabilityQuery = z.object({
  nickname: z
    .string({ error: 'NICKNAME_REQUIRED' })
    .trim()
    .min(1, { error: 'NICKNAME_REQUIRED' })
    .max(100, { error: 'NICKNAME_REQUIRED' }),
});

/** USER-03 */
export const profileSetupBody = z.object({
  nickname: nicknameField,
  profileImageKey: z.string().max(255).nullish(),
  gender: genderField,
  ageGroup: ageGroupField,
  localRegionIds: z
    .array(z.number().int().positive(), { error: 'LOCAL_REGION_COUNT_INVALID' })
    .min(1, { error: 'LOCAL_REGION_COUNT_INVALID' })
    .max(2, { error: 'LOCAL_REGION_COUNT_INVALID' }) // LOCAL_REGION_MAX와 같다
    .refine((ids) => new Set(ids).size === ids.length, { error: 'LOCAL_REGION_DUPLICATE' }),
  /** S-05-1 좋아하는 음식 (카테고리 id 1~12개, 첫 추천에 반영) */
  preferredCategoryIds: z
    .array(z.number().int().positive(), { error: 'PREFERRED_CATEGORY_INVALID' })
    .min(1, { error: 'PREFERRED_CATEGORY_INVALID' })
    .max(12, { error: 'PREFERRED_CATEGORY_INVALID' })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'PREFERRED_CATEGORY_INVALID' }),
});
export type ProfileSetupBody = z.infer<typeof profileSetupBody>;

/** USER-05 (보낸 필드만 바꾼다) */
export const profileUpdateBody = z.object({
  nickname: nicknameField.optional(),
  gender: genderField.optional(),
  ageGroup: ageGroupField.optional(),
});
export type ProfileUpdateBody = z.infer<typeof profileUpdateBody>;

/** LOCAL-02 */
export const localRegionAddBody = z.object({
  regionId: z
    .number({ error: 'REGION_ID_REQUIRED' })
    .int({ error: 'REGION_ID_REQUIRED' })
    .positive({ error: 'REGION_ID_REQUIRED' }),
});

/** LOCAL-03 */
export const localRegionParams = z.object({
  localRegionId: z.coerce.number().int().positive(),
});
