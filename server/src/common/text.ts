/** 글자(코드 포인트) 단위로 자른다. slice는 UTF-16 단위라 이모지가 반쪽으로 잘려 utf8mb4 저장이 깨질 수 있다 */
export function truncateChars(text: string, max: number) {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max).join('');
}
