import { z } from 'zod';

/** AUTH-08 */
export const oauthExchangeBody = z.object({
  oauthResultCode: z
    .string({ error: 'OAUTH_RESULT_CODE_REQUIRED' })
    .min(1, { error: 'OAUTH_RESULT_CODE_REQUIRED' }),
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
