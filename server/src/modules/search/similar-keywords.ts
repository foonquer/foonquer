import data from './data/similar-keywords.json';

const MAX_SIMILAR = 5;

/** 비교용: 공백을 없애고 영문은 소문자로 */
function normalize(keyword: string) {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

const groups: string[][] = data.groups;

/** 비슷한 메뉴표에서 keyword와 같은 묶음의 다른 메뉴 (없으면 []) */
export function similarKeywordsOf(keyword: string): string[] {
  const target = normalize(keyword);
  const found = new Set<string>();
  for (const group of groups) {
    if (!group.some((k) => normalize(k) === target)) continue;
    for (const k of group) if (normalize(k) !== target) found.add(k);
  }
  return [...found].slice(0, MAX_SIMILAR);
}
