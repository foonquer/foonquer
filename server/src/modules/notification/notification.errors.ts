import { defineErrors } from '../../common/errors/error-codes';

export const NotificationError = defineErrors({
  NOTIFICATION_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_NOT_FOUND',
    message: '알림을 찾을 수 없어요.',
  },
  INVALID_NOTIFICATION_CATEGORY: {
    status: 400,
    code: 'INVALID_NOTIFICATION_CATEGORY',
    message: '알림 종류가 올바르지 않아요.',
  },
  INVALID_PUSH_SUBSCRIPTION: {
    status: 400,
    code: 'INVALID_PUSH_SUBSCRIPTION',
    message: '푸시 구독 정보가 올바르지 않아요.',
  },
});
