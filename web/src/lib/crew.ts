// 모임 화면 공통 (모임원 동그라미 글자·색, 모임 퀘스트 진행 문구, 초대 링크)

import type { CrewMember, CrewQuest } from '../api/crews';

type Person = { userId: number; nickname: string | null };

/** 모임원 동그라미 색 (피그마: 주황·초록·파랑…, 나는 회색). 같은 사람은 어느 화면에서든 같은 색 */
const COLORS = ['#e09a3a', '#59a864', '#3d6fb5', '#c0587a', '#8a6bbf', '#2f8f8a'];
export const ME_COLOR = '#72766f';

export const avatarColor = (userId: number) => COLORS[userId % COLORS.length];

/** 동그라미 글자: 닉네임 첫 글자 (나는 "나") */
export const avatarLetter = (p: Person, meId: number | undefined) =>
  p.userId === meId ? '나' : Array.from(p.nickname ?? '?')[0];

/** 나는 맨 뒤 (피그마: 지 수 준 나) */
export const meLast = <T extends Person>(people: T[], meId: number | undefined) => [
  ...people.filter((p) => p.userId !== meId),
  ...people.filter((p) => p.userId === meId),
];

export const myIdOf = (members: CrewMember[]) => members.find((m) => m.isMe)?.userId;

/**
 * 모임 퀘스트 아래 줄
 * - 함께 정복: "2명 이상 같이 가면 완료" / "완료 · 3명 함께"
 * - 맛집 나눠 찾기: "2/4 완료 · 수영, 준형 남음" / "4/4 완료"
 */
export function crewQuestStatus(q: CrewQuest, members: CrewMember[]) {
  if (q.type === 'TOGETHER') {
    return q.status === 'DONE'
      ? `완료 · ${q.participants.length}명 함께`
      : `${q.target}명 이상 같이 가면 완료`;
  }
  const done = new Set(q.participants.map((p) => p.userId));
  const left = members
    .filter((m) => m.status === 'JOINED' && !done.has(m.userId))
    .map((m) => (m.isMe ? '나' : m.nickname));
  const head = `${q.progress}/${q.target} 완료`;
  return q.status === 'DONE' || left.length === 0 ? head : `${head} · ${left.join(', ')} 남음`;
}

/** 모임 퀘스트에 같이 그릴 사람: 함께 정복은 진행 전이면 모임원 모두, 나머지는 해낸 사람 */
export function crewQuestPeople(q: CrewQuest, members: CrewMember[]) {
  if (q.type === 'TOGETHER' && q.status === 'ACTIVE' && q.participants.length === 0) {
    return members.filter((m) => m.status === 'JOINED');
  }
  return q.participants;
}

/** 초대 링크 (받은 사람이 열면 초대 받기 화면) */
export const inviteLinkOf = (code: string) =>
  `${window.location.origin}/crews/join?code=${encodeURIComponent(code)}`;
