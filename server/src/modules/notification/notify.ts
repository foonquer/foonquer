import type { Db } from '../../common/db';
import { truncateChars } from '../../common/text';

/** 알림함 필터 (NOTI-01 category) */
export type NotificationCategory = 'RANK' | 'REVIEW' | 'MUKKAEBI' | 'NOTICE';

/** ERD notification.type */
export type NotificationType =
  | 'CONQUEST'
  | 'RANK_CHANGE'
  | 'TIER_UP'
  | 'TIER_DOWN'
  | 'MUKJJANG'
  | 'SEASON_END'
  | 'HELPFUL'
  | 'SAVED_REMINDER'
  | 'LEVEL_UP'
  | 'NEW_ITEM'
  | 'ACHIEVEMENT'
  | 'NOTICE'
  | 'EVENT'
  | 'INQUIRY_ANSWER'
  | 'CREW_INVITE'
  | 'CREW_TOGETHER';

export interface NotificationInput {
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  content: string;
  /** 눌렀을 때 갈 곳 (NOTI-01 deepLink를 이것으로 만든다) — RESTAURANT / REVIEW / SIGUNGU / SEASON / INQUIRY / NOTICE / ITEM / CREW / CREW_INVITE */
  refType?: string;
  refId?: bigint | number;
}

/**
 * 알림함에 알림을 하나 넣는다. 알림 설정(정복·순위·마케팅)을 꺼도 알림함에는 쌓고 푸시만 보내지 않는다(SET-02 비고).
 * 푸시 발송(Web Push)은 2차라 지금은 알림함만 채운다.
 */
export async function notify(db: Db, userId: bigint, input: NotificationInput, now = new Date()) {
  await db.notification.create({
    data: {
      userId,
      category: input.category,
      type: input.type,
      title: truncateChars(input.title, 60),
      content: truncateChars(input.content, 255),
      refType: input.refType ?? null,
      refId: input.refId === undefined ? null : BigInt(input.refId),
      regDate: now,
    },
  });
}
