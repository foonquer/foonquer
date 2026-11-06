import { defineErrors } from '../../common/errors/error-codes';

export const MukkaebiError = defineErrors({
  ITEM_NOT_OWNED: {
    status: 403,
    code: 'ITEM_NOT_OWNED',
    message: '가진 아이템만 착용할 수 있어요.',
  },
  INVALID_ITEM_SLOT: {
    status: 400,
    code: 'INVALID_ITEM_SLOT',
    message: '그 자리에 착용할 수 없는 아이템이에요.',
  },
  BACKGROUND_LOCKED: {
    status: 403,
    code: 'BACKGROUND_LOCKED',
    message: '아직 얻지 못한 배경이에요.',
  },
  INVALID_ITEM_CATEGORY: {
    status: 400,
    code: 'INVALID_ITEM_CATEGORY',
    message: '아이템 종류가 올바르지 않아요.',
  },
  ITEM_NOT_FOUND: { status: 404, code: 'ITEM_NOT_FOUND', message: '아이템을 찾을 수 없어요.' },
  RECIPE_NOT_FOUND: {
    status: 404,
    code: 'RECIPE_NOT_FOUND',
    message: '합쳐서 만들 수 없는 아이템이에요.',
  },
  NOT_ENOUGH_MATERIAL: { status: 409, code: 'NOT_ENOUGH_MATERIAL', message: '재료가 부족해요.' },
  CELEBRATION_NOT_FOUND: {
    status: 404,
    code: 'CELEBRATION_NOT_FOUND',
    message: '축하 이벤트를 찾을 수 없어요.',
  },
  ITEM_NOT_FOR_SALE: {
    status: 400,
    code: 'ITEM_NOT_FOR_SALE',
    message: '판매하지 않는 아이템이에요.',
  },
  ITEM_ALREADY_OWNED: {
    status: 409,
    code: 'ITEM_ALREADY_OWNED',
    message: '이미 가진 아이템이에요.',
  },
  NO_FIELDS_TO_UPDATE: { status: 400, code: 'NO_FIELDS_TO_UPDATE', message: '바꿀 항목이 없어요.' },
});
