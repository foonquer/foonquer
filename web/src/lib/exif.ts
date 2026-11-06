// 갤러리 사진의 EXIF에서 촬영 시각·위치를 읽는다 (현장인증 VISIT-02 보강 검증).
// 브라우저나 기기가 EXIF를 지웠으면 빈 값 — 서버는 위치 확인만으로도 통과시킨다.

export type PhotoMeta = { takenAt?: string; lat?: number; lng?: number };

const SOI = 0xffd8;
const APP1 = 0xffe1;

/** JPEG 앞부분만 읽는다 (EXIF는 APP1에 있다) */
const READ_BYTES = 256 * 1024;

export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  try {
    const view = new DataView(await file.slice(0, READ_BYTES).arrayBuffer());
    return parseExif(view);
  } catch {
    return {};
  }
}

export function parseExif(view: DataView): PhotoMeta {
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return {};
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if (marker === APP1 && view.getUint32(offset + 4) === 0x45786966) {
      return readTiff(view, offset + 10);
    }
    if ((marker & 0xff00) !== 0xff00) return {};
    offset += 2 + length;
  }
  return {};
}

function readTiff(view: DataView, tiff: number): PhotoMeta {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);

  /** IFD 항목들: tag → 값이 있는 곳(4바이트 안이면 그 자리) */
  const entries = (ifd: number) => {
    const map = new Map<number, { type: number; count: number; at: number }>();
    const n = u16(ifd);
    for (let i = 0; i < n; i += 1) {
      const e = ifd + 2 + i * 12;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = ({ 2: 1, 3: 2, 4: 4, 5: 8 } as Record<number, number>)[type] ?? 1;
      map.set(u16(e), { type, count, at: size * count > 4 ? tiff + u32(e + 8) : e + 8 });
    }
    return map;
  };
  const ascii = (e?: { count: number; at: number }) =>
    e
      ? String.fromCharCode(
          ...Array.from({ length: e.count }, (_, i) => view.getUint8(e.at + i)),
        ).replace(/\0+$/, '')
      : undefined;
  const rationals = (e?: { count: number; at: number }) =>
    e
      ? Array.from({ length: e.count }, (_, i) => u32(e.at + i * 8) / (u32(e.at + i * 8 + 4) || 1))
      : undefined;

  const ifd0 = entries(tiff + u32(tiff + 4));
  const meta: PhotoMeta = {};

  const exifPointer = ifd0.get(0x8769);
  if (exifPointer) {
    const exif = entries(tiff + u32(exifPointer.at));
    // "2026:09:25 12:34:56" (+ OffsetTimeOriginal "+09:00", 없으면 한국 시간으로 본다)
    const taken = ascii(exif.get(0x9003));
    const zone = ascii(exif.get(0x9011)) ?? '+09:00';
    const m = taken && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(taken);
    if (m && /^[+-]\d{2}:\d{2}$/.test(zone)) {
      meta.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`;
    }
  }

  const gpsPointer = ifd0.get(0x8825);
  if (gpsPointer) {
    const gps = entries(tiff + u32(gpsPointer.at));
    const lat = rationals(gps.get(0x0002));
    const lng = rationals(gps.get(0x0004));
    // 위치를 못 잡은 기기는 0,0을 적기도 한다
    if (lat?.length === 3 && lng?.length === 3 && (lat[0] !== 0 || lng[0] !== 0)) {
      const deg = (v: number[]) => v[0] + v[1] / 60 + v[2] / 3600;
      const latSign = ascii(gps.get(0x0001)) === 'S' ? -1 : 1;
      const lngSign = ascii(gps.get(0x0003)) === 'W' ? -1 : 1;
      meta.lat = Math.round(latSign * deg(lat) * 1e6) / 1e6;
      meta.lng = Math.round(lngSign * deg(lng) * 1e6) / 1e6;
    }
  }
  return meta;
}
