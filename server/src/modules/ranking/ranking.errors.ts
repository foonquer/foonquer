import { defineErrors } from '../../common/errors/error-codes';

export const RankingError = defineErrors({
  SEASON_NOT_FOUND: { status: 404, code: 'SEASON_NOT_FOUND', message: '시즌을 찾을 수 없어요.' },
  NO_ACTIVE_SEASON: {
    status: 404,
    code: 'NO_ACTIVE_SEASON',
    message: '지금 진행 중인 시즌이 없어요.',
  },
  SIGUNGU_NOT_FOUND: {
    status: 404,
    code: 'SIGUNGU_NOT_FOUND',
    message: '서울의 구를 찾을 수 없어요.',
  },
  TITLE_NOT_OWNED: {
    status: 403,
    code: 'TITLE_NOT_OWNED',
    message: '가지고 있는 칭호만 대표 칭호로 고를 수 있어요.',
  },
  INVALID_TITLE: { status: 400, code: 'INVALID_TITLE', message: '칭호를 다시 골라 주세요.' },
});
