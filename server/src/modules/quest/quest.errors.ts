import { defineErrors } from '../../common/errors/error-codes';

export const QuestError = defineErrors({
  QUEST_NOT_FOUND: { status: 404, code: 'QUEST_NOT_FOUND', message: '퀘스트를 찾을 수 없어요.' },
  QUEST_WEEK_NOT_FOUND: {
    status: 404,
    code: 'QUEST_WEEK_NOT_FOUND',
    message: '퀘스트 기록을 찾을 수 없어요.',
  },
  QUEST_NOT_ACTIVE: {
    status: 409,
    code: 'QUEST_NOT_ACTIVE',
    message: '이미 끝났거나 바꾼 퀘스트예요.',
  },
  QUEST_SWAP_USED: {
    status: 409,
    code: 'QUEST_SWAP_USED',
    message: '이번 주에는 이미 퀘스트를 바꿨어요. 다음 주 월요일에 다시 바꿀 수 있어요.',
  },
  QUEST_IN_PROGRESS: {
    status: 409,
    code: 'QUEST_IN_PROGRESS',
    message: '이미 진행한 퀘스트는 바꿀 수 없어요.',
  },
  QUEST_NO_REPLACEMENT: {
    status: 409,
    code: 'QUEST_NO_REPLACEMENT',
    message: '지금은 바꿔 줄 다른 퀘스트가 없어요.',
  },
});
