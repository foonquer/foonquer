/** member.status 코드값 */
export const MemberStatus = {
  /** 프로필 설정 전 */
  PENDING: 'P',
  /** 활성 */
  ACTIVE: 'A',
  /** 이용 정지 */
  SUSPENDED: 'S',
  /** 탈퇴 */
  WITHDRAWN: 'D',
} as const;

export type MemberStatusCode = (typeof MemberStatus)[keyof typeof MemberStatus];
