import { defineErrors } from '../../common/errors/error-codes';

export const CrewError = defineErrors({
  CREW_NOT_FOUND: { status: 404, code: 'CREW_NOT_FOUND', message: '모임을 찾을 수 없어요.' },
  INVALID_INVITE_CODE: {
    status: 404,
    code: 'INVALID_INVITE_CODE',
    message: '초대 코드를 다시 확인해 주세요.',
  },
  CREW_FULL: { status: 409, code: 'CREW_FULL', message: '모임 인원이 다 찼어요.' },
  CREW_ALREADY_MEMBER: {
    status: 409,
    code: 'CREW_ALREADY_MEMBER',
    message: '이미 모임에 있거나 초대한 사람이에요.',
  },
  CREW_MEMBER_NOT_FOUND: {
    status: 404,
    code: 'CREW_MEMBER_NOT_FOUND',
    message: '그 닉네임의 탐험가를 찾지 못했어요.',
  },
  CREW_INVITATION_NOT_FOUND: {
    status: 404,
    code: 'CREW_INVITATION_NOT_FOUND',
    message: '받은 초대가 없어요.',
  },
  CREW_SIGUNGU_REQUIRED: {
    status: 400,
    code: 'CREW_SIGUNGU_REQUIRED',
    message: '주로 정복할 동네를 골라 주세요.',
  },
});
