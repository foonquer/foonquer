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
  /** 탐방러 프로필 소개글 (60자, null이면 지움) — ERD v1.2 */
  bio: z
    .string()
    .trim()
    // DB varchar(60)과 같이 글자 수로 센다 (이모지도 1자)
    .refine((v) => [...v].length <= 60, { error: 'BIO_TOO_LONG' })
    .nullable()
    .optional(),
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

/** USER-02 업로드할 수 있는 사진 형식 → 확장자 */
export const PROFILE_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** USER-02 */
export const profileImageUploadBody = z.object({
  contentType: z.enum(Object.keys(PROFILE_IMAGE_TYPES) as [keyof typeof PROFILE_IMAGE_TYPES], {
    error: 'UNSUPPORTED_IMAGE_TYPE',
  }),
  fileSize: z.number().int().positive().max(PROFILE_IMAGE_MAX_BYTES, { error: 'IMAGE_TOO_LARGE' }),
});
export type ProfileImageUploadBody = z.infer<typeof profileImageUploadBody>;

/** USER-06 */
export const profileImageBody = z.object({
  imageKey: z
    .string({ error: 'IMAGE_KEY_REQUIRED' })
    .trim()
    .min(1, { error: 'IMAGE_KEY_REQUIRED' })
    .max(255, { error: 'PROFILE_IMAGE_NOT_FOUND' }),
});

/** SET-02 (보낸 항목만 바꾼다) */
export const notificationSettingsBody = z.object({
  conquestAlarm: z.boolean().optional(),
  rankAlarm: z.boolean().optional(),
  marketingAlarm: z.boolean().optional(),
});
export type NotificationSettingsBody = z.infer<typeof notificationSettingsBody>;

/** SET-04 떠나는 이유 (member_withdrawal.reason_code) */
export const WITHDRAWAL_REASONS = [
  { code: 'RARELY_USE', label: '자주 쓰지 않아요' },
  { code: 'NO_RESTAURANT', label: '가고 싶은 맛집이 없어요' },
  { code: 'VERIFY_HARD', label: '영수증 인증이 번거로워요' },
  { code: 'ETC', label: '기타' },
] as const;
type WithdrawalReasonCode = (typeof WITHDRAWAL_REASONS)[number]['code'];

/** SET-04 */
export const withdrawalBody = z.object({
  confirmed: z.literal(true, { error: 'WITHDRAWAL_CONFIRM_REQUIRED' }),
  reasonCode: z
    .enum(WITHDRAWAL_REASONS.map((r) => r.code) as [WithdrawalReasonCode], {
      error: 'INVALID_WITHDRAWAL_REASON',
    })
    .nullish(),
  reasonDetail: z.string().max(255, { error: 'REASON_DETAIL_TOO_LONG' }).nullish(),
});
export type WithdrawalBody = z.infer<typeof withdrawalBody>;
