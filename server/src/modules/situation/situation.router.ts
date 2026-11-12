import { Router } from 'express';
import { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { rateLimit } from '../../common/middlewares/rate-limit';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { hasLocationPair, optionalLocationShape } from '../region/region.schema';
import { conditionCount, conditionsSchema } from './situation-conditions';
import { MAX_TEXT, parseSituation } from './situation-parse';
import { getSituationRecommendations } from './situation.service';

const parseBody = z.object({ text: z.string().trim().min(2).max(MAX_TEXT) });

const recommendBody = z
  .object({
    regionId: z.number().int().positive().optional(),
    conditions: conditionsSchema.refine((c) => conditionCount(c) > 0),
    ...optionalLocationShape,
  })
  .refine(hasLocationPair, { error: 'INVALID_COORDINATE' });

/** /api/v1/recommendations/situation — 상황 직접 입력 추천 (피그마 3, 3-4) */
export const situationRouter = Router();

// 상황 문장 → 조건. 원문은 저장하지 않는다 (Gemini 호출이라 횟수를 막는다)
situationRouter.post(
  '/parse',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 20 }),
  validate({ body: parseBody }),
  async (req, res) => {
    const { text } = req.body as z.infer<typeof parseBody>;
    ok(res, await parseSituation(text), '상황을 읽었어요.');
  },
);

// 조건 → 상황 맞춤 결과
situationRouter.post(
  '/',
  requireAuth(),
  rateLimit({ windowMs: 60_000, limit: 30 }),
  validate({ body: recommendBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const body = req.body as z.infer<typeof recommendBody>;
    ok(res, await getSituationRecommendations(userId, body), '상황 맞춤 추천을 조회했어요.');
  },
);
