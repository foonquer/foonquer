import { defineErrors } from '../../common/errors/error-codes';

export const RewardError = defineErrors({
  POINT_NOT_ENOUGH: {
    status: 409,
    code: 'POINT_NOT_ENOUGH',
    message: '먹포인트가 부족해요.',
  },
});
