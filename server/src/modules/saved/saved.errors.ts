import { defineErrors } from '../../common/errors/error-codes';

export const SavedError = defineErrors({
  INVALID_SAVED_TAB: {
    status: 400,
    code: 'INVALID_SAVED_TAB',
    message: '목록 종류가 올바르지 않아요.',
  },
  MEMO_TOO_LONG: { status: 400, code: 'MEMO_TOO_LONG', message: '메모는 50자까지 쓸 수 있어요.' },
});
