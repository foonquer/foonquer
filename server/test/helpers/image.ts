/** key 확장자에 맞는 파일 앞부분(매직 바이트). 스토리지 readObjectHead mock에 쓴다 */
export function imageHead(key: string): Buffer {
  if (key.endsWith('.png')) {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  }
  if (key.endsWith('.webp')) return Buffer.from('RIFF\0\0\0\0WEBP', 'latin1');
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
}
