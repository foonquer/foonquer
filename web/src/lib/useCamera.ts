import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * checking 권한 확인 중 · ask 물어보기 전(안내 화면) · starting 켜는 중 · live 화면에 나오는 중 ·
 * blocked 브라우저에서 막힘 · none 화면 안 카메라를 못 씀(카메라 없음·지원 안 함 → 휴대폰 카메라 앱으로)
 */
export type CameraState = 'checking' | 'ask' | 'starting' | 'live' | 'blocked' | 'none';

const canStream = () => Boolean(navigator.mediaDevices?.getUserMedia);

/** 화면 안 카메라 (영수증 촬영). 돌려준 video ref에 뒤 카메라를 비추고, capture로 지금 화면을 JPEG 파일로 찍는다 */
export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>(() =>
    !canStream() ? 'none' : navigator.permissions ? 'checking' : 'ask',
  );
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  /** 켜기 (처음이면 브라우저가 권한을 묻는다). 막혀 있으면 blocked */
  const start = useCallback(async () => {
    setState('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      // 켜는 사이에 화면을 떠났으면 바로 끈다
      if (!alive.current) {
        s.getTracks().forEach((t) => t.stop());
        return 'none' as const;
      }
      stop();
      stream.current = s;
      setState('live');
      return 'live' as const;
    } catch (err) {
      const blocked =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setState(blocked ? 'blocked' : 'none');
      return blocked ? ('blocked' as const) : ('none' as const);
    }
  }, [stop]);

  // 이미 허용했으면 바로 켜고, 막혀 있으면 꺼짐 안내, 아직 모르면 안내 화면부터
  useEffect(() => {
    alive.current = true;
    if (!canStream() || !navigator.permissions) return;
    let current = true;
    navigator.permissions.query({ name: 'camera' as PermissionName }).then(
      (status) => {
        if (!current) return;
        if (status.state === 'granted') void start();
        else setState(status.state === 'denied' ? 'blocked' : 'ask');
      },
      // camera 권한 조회를 지원하지 않는 브라우저
      () => current && setState('ask'),
    );
    return () => {
      current = false;
    };
  }, [start]);

  // 켜지면 화면에 붙인다
  useEffect(() => {
    if (state === 'live' && video.current) video.current.srcObject = stream.current;
  }, [state]);

  // 화면을 떠나면 끈다
  useEffect(
    () => () => {
      alive.current = false;
      stop();
    },
    [stop],
  );

  /** 지금 화면을 찍는다 (아직 영상이 안 나오면 null) */
  const capture = useCallback(
    () =>
      new Promise<File | null>((resolve) => {
        const v = video.current;
        if (!v || !v.videoWidth) return resolve(null);
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d');
        // 그릴 수 없으면 빈 사진을 올리지 않게 실패로 (찍는 화면이 다시 찍어 달라고 알린다)
        if (!ctx) return resolve(null);
        ctx.drawImage(v, 0, 0);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) : null),
          'image/jpeg',
          0.92,
        );
      }),
    [],
  );

  return { video, state, start, stop, capture };
}
