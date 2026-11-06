/** 마지막 글자에 받침이 있는지 (한글이 아니면 숫자 읽기 기준으로 판단) */
function hasFinalConsonant(word: string): boolean {
  const last = word.trim().at(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  // 숫자: 0(영) 1(일) 3(삼) 6(육) 7(칠) 8(팔)은 받침이 있다
  if (/[0136-8]/.test(last)) return true;
  return false;
}

/** 을/를만. 예) 리뷰 10개 → 를 (따옴표로 감쌀 때) */
export function objectParticle(word: string) {
  return hasFinalConsonant(word) ? '을' : '를';
}

/** 을/를 붙이기. 예) 가양동 → 가양동을, 종로1가 → 종로1가를 */
export function withObjectParticle(word: string) {
  return `${word}${objectParticle(word)}`;
}

/** 이/가 붙이기. 예) 시즌 3 → 시즌 3이, 시즌 2 → 시즌 2가 */
export function withSubjectParticle(word: string) {
  return `${word}${hasFinalConsonant(word) ? '이' : '가'}`;
}
