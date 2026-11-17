import { defineErrors } from '../../common/errors/error-codes';

export const MapaeError = defineErrors({
  INVALID_MAPAE_EVENT_TYPE: {
    status: 400,
    code: 'INVALID_MAPAE_EVENT_TYPE',
    message: '어떤 이벤트였는지 골라 주세요.',
  },
  MAPAE_REPORT_TOO_FAR: {
    status: 400,
    code: 'MAPAE_REPORT_TOO_FAR',
    message: '가게 안이나 가게 앞(100m 안)에서만 제보할 수 있어요.',
  },
  MAPAE_REPORT_DUPLICATE: {
    status: 409,
    code: 'MAPAE_REPORT_DUPLICATE',
    message: '이미 이 가게를 제보했어요. 다른 방문자의 제보를 기다리는 중이에요.',
  },
  MAPAE_ALREADY_SHOWN: {
    status: 409,
    code: 'MAPAE_ALREADY_SHOWN',
    message: '이미 마패가 표시된 가게예요.',
  },
  MAPAE_REPORT_NOT_FOUND: {
    status: 404,
    code: 'MAPAE_REPORT_NOT_FOUND',
    message: '제보를 찾을 수 없어요.',
  },
  MAPAE_NOT_SHOWN: {
    status: 409,
    code: 'MAPAE_NOT_SHOWN',
    message: '마패가 표시된 가게만 이의제기할 수 있어요.',
  },
  INVALID_OWNER_RELATION: {
    status: 400,
    code: 'INVALID_OWNER_RELATION',
    message: '가게와의 관계를 골라 주세요.',
  },
  INVALID_OBJECTION_REASON: {
    status: 400,
    code: 'INVALID_OBJECTION_REASON',
    message: '이의제기 사유를 골라 주세요.',
  },
  OBJECTION_CONTENT_REQUIRED: {
    status: 400,
    code: 'OBJECTION_CONTENT_REQUIRED',
    message: '설명을 1~1000자로 적어 주세요.',
  },
});
