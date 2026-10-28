// 앞 글자 받침에 따라 바뀌는 조사

/** 마지막 글자의 받침 번호 (0이면 받침 없음, 한글이 아니면 null) */
function finalConsonant(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (Number.isNaN(code) || code < 0 || code > 11171) return null;
  return code % 28;
}

/** 이/가 (단골이, 고수가) */
export function iGa(word: string) {
  return `${word}${finalConsonant(word) === 0 ? '가' : '이'}`;
}

/** 으로/로 (가양동으로, 종로1가로, 서울로) — 받침 없거나 ㄹ 받침이면 '로' */
export function euro(word: string) {
  const fc = finalConsonant(word);
  return `${word}${fc === 0 || fc === 8 ? '로' : '으로'}`;
}

/** 을/를 (가양동을, 서울로를) */
export function eulReul(word: string) {
  return `${word}${finalConsonant(word) === 0 ? '를' : '을'}`;
}
