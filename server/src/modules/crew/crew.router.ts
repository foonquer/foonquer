import { Router } from 'express';
import { z } from 'zod';
import { getAuthUser, requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import {
  createCrew,
  getCrew,
  getInvitation,
  inviteMember,
  joinByCode,
  leaveCrew,
  listCrewQuests,
  listMyCrews,
  previewByCode,
  respondInvitation,
} from './crew.service';

const crewParams = z.object({ crewId: z.coerce.number().int().positive() });
const codeParams = z.object({ code: z.string().trim().min(4).max(10) });
const createBody = z.object({
  type: z.enum(['FRIEND', 'FAMILY', 'COUPLE'], { error: 'INVALID_CREW_TYPE' }),
  name: z
    .string({ error: 'INVALID_CREW_NAME' })
    .trim()
    .min(2, { error: 'INVALID_CREW_NAME' })
    .max(12, { error: 'INVALID_CREW_NAME' }),
  sigunguId: z.number().int().positive().optional(),
});
const inviteBody = z.object({ nickname: z.string().trim().min(1).max(10) });
const respondBody = z.object({ accept: z.boolean() });

type CrewParams = z.infer<typeof crewParams>;
const crewIdOf = (params: unknown) => BigInt((params as CrewParams).crewId);

/** /api/v1/crews 모임 (피그마 12. 모임) */
export const crewRouter = Router();

// CREW-02 내 모임 + 받은 초대
crewRouter.get('/', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await listMyCrews(userId), '내 모임을 조회했어요.');
});

// CREW-01 모임 만들기
crewRouter.post(
  '/',
  requireAuth(),
  validate(
    { body: createBody },
    { validationMessage: '모임 종류와 이름(2~12자)을 확인해 주세요.' },
  ),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(
      res,
      await createCrew(userId, req.body as z.infer<typeof createBody>),
      '모임을 만들었어요.',
      201,
    );
  },
);

// CREW-08 퀘스트 시트 모임 퀘스트 탭
crewRouter.get('/quests', requireAuth(), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await listCrewQuests(userId), '모임 퀘스트를 조회했어요.');
});

// CREW-05 초대 코드로 미리 보기·참여
crewRouter.get('/join/:code', requireAuth(), validate({ params: codeParams }), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await previewByCode(userId, (req.params as { code: string }).code), '모임을 조회했어요.');
});
crewRouter.post(
  '/join/:code',
  requireAuth(),
  validate({ params: codeParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(res, await joinByCode(userId, (req.params as { code: string }).code), '모임에 참여했어요.');
  },
);

// CREW-03 모임 공간
crewRouter.get('/:crewId', requireAuth(), validate({ params: crewParams }), async (req, res) => {
  const { userId } = getAuthUser(req);
  ok(res, await getCrew(userId, crewIdOf(req.params)), '모임을 조회했어요.');
});

// CREW-04 닉네임으로 초대
crewRouter.post(
  '/:crewId/invites',
  requireAuth(),
  validate({ params: crewParams, body: inviteBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { nickname } = req.body as z.infer<typeof inviteBody>;
    ok(res, await inviteMember(userId, crewIdOf(req.params), nickname), '초대했어요.', 201);
  },
);

// CREW-06 받은 초대 보기·수락·거절
crewRouter.get(
  '/:crewId/invitation',
  requireAuth(),
  validate({ params: crewParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    ok(res, await getInvitation(userId, crewIdOf(req.params)), '받은 초대를 조회했어요.');
  },
);
crewRouter.post(
  '/:crewId/invitation',
  requireAuth(),
  validate({ params: crewParams, body: respondBody }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    const { accept } = req.body as z.infer<typeof respondBody>;
    const data = await respondInvitation(userId, crewIdOf(req.params), accept);
    ok(res, data, accept ? '모임에 참여했어요.' : '초대를 거절했어요.');
  },
);

// CREW-07 모임 나가기
crewRouter.delete(
  '/:crewId/members/me',
  requireAuth(),
  validate({ params: crewParams }),
  async (req, res) => {
    const { userId } = getAuthUser(req);
    await leaveCrew(userId, crewIdOf(req.params));
    ok(res, null, '모임에서 나왔어요.');
  },
);
