/** 사진 확장자 (key 끝) */
export type ImageExt = 'jpg' | 'png' | 'webp';

/** 업로드 URL을 줄 수 있는 형식 → key 확장자 */
export const IMAGE_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const satisfies Record<string, ImageExt>;

export type ImageContentType = keyof typeof IMAGE_CONTENT_TYPES;

/** 형식을 확인하려고 읽는 앞부분 바이트 수 */
export const MAGIC_BYTES = 12;

const MAGIC: Record<ImageExt, (head: Buffer) => boolean> = {
  jpg: (h) => h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  png: (h) =>
    h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: (h) =>
    h.subarray(0, 4).toString('latin1') === 'RIFF' &&
    h.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** 파일 앞부분(매직 바이트)이 확장자와 맞는 실제 이미지인지. Content-Type만 믿지 않는다 */
export function isImageOf(ext: ImageExt, head: Buffer) {
  return MAGIC[ext](head);
}
