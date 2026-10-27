import { z } from 'zod';

/** 영문과 숫자를 각각 1개 이상 포함한 8~64자, 공백 불가 (AUTH-04, AUTH-14, SET-05) */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)\S{8,64}$/;

/** 이메일: 양쪽 공백 제거 → 소문자 → 형식·길이(255자) 확인 */
export const emailField = z
  .string({ error: 'EMAIL_REQUIRED' })
  .trim()
  .min(1, { error: 'EMAIL_REQUIRED' })
  .max(255, { error: 'INVALID_EMAIL_FORMAT' })
  .toLowerCase()
  .pipe(z.email({ error: 'INVALID_EMAIL_FORMAT' }));

const newPasswordField = z.string().regex(PASSWORD_PATTERN, { error: 'INVALID_PASSWORD_FORMAT' });

const consentsField = z
  .object({
    terms: z.boolean(),
    privacy: z.boolean(),
    location: z.boolean(),
    marketing: z.boolean(),
  })
  .refine((c) => c.terms && c.privacy && c.location, { error: 'REQUIRED_CONSENT_MISSING' });

/** AUTH-01 */
export const emailAvailabilityQuery = z.object({ email: emailField });

/** AUTH-02 */
export const verificationCodeSendBody = z.object({ email: emailField });

/** AUTH-03 */
export const verificationCodeVerifyBody = z.object({
  email: emailField,
  code: z
    .string({ error: 'VERIFICATION_CODE_REQUIRED' })
    .trim()
    .min(1, { error: 'VERIFICATION_CODE_REQUIRED' })
    .regex(/^\d{6}$/, { error: 'INVALID_VERIFICATION_CODE_FORMAT' }),
});

/** AUTH-04 */
export const signupBody = z
  .object({
    email: emailField,
    password: newPasswordField,
    passwordConfirm: z.string(),
    emailVerificationToken: z.string().min(1),
    consents: consentsField,
  })
  .refine((b) => b.password === b.passwordConfirm, {
    error: 'PASSWORD_MISMATCH',
    path: ['passwordConfirm'],
  });
export type SignupBody = z.infer<typeof signupBody>;

/** AUTH-05 (형식이 틀린 이메일도 "가입되지 않은 계정"과 같이 LOGIN_INVALID_CREDENTIALS로 답한다) */
export const loginBody = z.object({
  email: z.string().trim().min(1).max(255).toLowerCase(),
  password: z.string().min(1).max(200),
});

/** AUTH-12 */
export const passwordResetEmailBody = z.object({ email: emailField });

/** AUTH-13 */
export const passwordResetTokenQuery = z.object({
  token: z
    .string({ error: 'PASSWORD_RESET_TOKEN_REQUIRED' })
    .trim()
    .min(1, { error: 'PASSWORD_RESET_TOKEN_REQUIRED' }),
});

/** AUTH-14 */
export const passwordResetBody = z
  .object({
    token: z
      .string({ error: 'PASSWORD_RESET_TOKEN_INVALID' })
      .min(1, { error: 'PASSWORD_RESET_TOKEN_INVALID' }),
    newPassword: newPasswordField,
    newPasswordConfirm: z.string(),
  })
  .refine((b) => b.newPassword === b.newPasswordConfirm, {
    error: 'PASSWORD_MISMATCH',
    path: ['newPasswordConfirm'],
  });

/** AUTH-08 */
export const oauthExchangeBody = z.object({
  oauthResultCode: z
    .string({ error: 'OAUTH_RESULT_CODE_REQUIRED' })
    .min(1, { error: 'OAUTH_RESULT_CODE_REQUIRED' }),
});

/** AUTH-09 */
export const accountLinkBody = z.object({
  accountLinkToken: z
    .string({ error: 'ACCOUNT_LINK_TOKEN_REQUIRED' })
    .min(1, { error: 'ACCOUNT_LINK_TOKEN_REQUIRED' }),
});

/** AUTH-15 (네 항목 모두 보내야 하고 필수 3개는 true) */
export const consentsBody = z
  .object({
    terms: z.boolean(),
    privacy: z.boolean(),
    location: z.boolean(),
    marketing: z.boolean(),
  })
  .refine((c) => c.terms && c.privacy && c.location, { error: 'REQUIRED_CONSENT_MISSING' });

/** SET-05 */
export const passwordChangeBody = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordField,
    newPasswordConfirm: z.string(),
  })
  .refine((b) => b.newPassword === b.newPasswordConfirm, {
    error: 'PASSWORD_MISMATCH',
    path: ['newPasswordConfirm'],
  });
