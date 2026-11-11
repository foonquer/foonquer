import { Router } from 'express';
import { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import {
  dismissQuest,
  getCurrentQuests,
  getQuestDetail,
  getQuestRecords,
  getQuestWeek,
  swapQuest,
} from './quest.service';

const questParams = z.object({ questId: z.coerce.number().int().positive() });
const weekParams = z.object({ weekId: z.coerce.number().int().positive() });

/** /api/v1/quests 맞춤 퀘스트 (피그마 12) */
export const questRouter = Router();

// QUEST-01 이번 주 퀘스트 (처음 열면 만든다)
questRouter.get('/current', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getCurrentQuests(userId), '이번 주 퀘스트를 조회했어요.');
});

// QUEST-05 퀘스트 기록
questRouter.get('/records', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getQuestRecords(userId), '퀘스트 기록을 조회했어요.');
});

// QUEST-06 지난 주 퀘스트
questRouter.get(
  '/weeks/:weekId',
  requireAuth(),
  validate({ params: weekParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { weekId } = req.params as unknown as z.infer<typeof weekParams>;
    ok(res, await getQuestWeek(userId, BigInt(weekId)), '퀘스트 기록을 조회했어요.');
  },
);

// QUEST-02 퀘스트 상세
questRouter.get('/:questId', requireAuth(), validate({ params: questParams }), async (req, res) => {
  const { userId } = getAuthUser(req);
  const { questId } = req.params as unknown as z.infer<typeof questParams>;
  ok(res, await getQuestDetail(userId, BigInt(questId)), '퀘스트를 조회했어요.');
});

// QUEST-03 다른 퀘스트로 바꾸기 (주 1번)
questRouter.post(
  '/:questId/swap',
  requireAuth(),
  validate({ params: questParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { questId } = req.params as unknown as z.infer<typeof questParams>;
    ok(res, await swapQuest(userId, BigInt(questId)), '다른 퀘스트로 바꿨어요.');
  },
);

// QUEST-04 관심 없어요 (그 종류를 덜 추천하고 다른 퀘스트로 바꾼다)
questRouter.post(
  '/:questId/dismiss',
  requireAuth(),
  validate({ params: questParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { questId } = req.params as unknown as z.infer<typeof questParams>;
    ok(res, await dismissQuest(userId, BigInt(questId)), '이 종류는 덜 추천할게요.');
  },
);
