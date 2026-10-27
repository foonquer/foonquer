import { Router } from 'express';
import type { z } from 'zod';
import { requireAuth } from '../../common/auth/require-auth';
import { validate } from '../../common/middlewares/validate';
import { ok } from '../../common/response';
import { currentRegionQuery, regionSearchQuery } from './region.schema';
import { findDongByLocation, searchDongs } from './region.service';

/** /api/v1/regions — 프로필 설정 전(약관 동의 후) 회원도 부른다 */
export const regionRouter = Router();

// REGION-01 동 검색
regionRouter.get(
  '/search',
  requireAuth('profile'),
  validate({ query: regionSearchQuery }),
  async (req, res) => {
    const { keyword, limit } = req.query as unknown as z.infer<typeof regionSearchQuery>;
    ok(res, await searchDongs(keyword, limit), '동네를 찾았어요.');
  },
);

// REGION-02 현재 위치로 동 찾기
regionRouter.get(
  '/current',
  requireAuth('profile'),
  validate({ query: currentRegionQuery }),
  async (req, res) => {
    const { lat, lng } = req.query as unknown as z.infer<typeof currentRegionQuery>;
    ok(res, await findDongByLocation(lat, lng), '지금 계신 동네를 찾았어요.');
  },
);
