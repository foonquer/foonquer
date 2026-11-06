import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * checking 권한 확인 중 · ask 물어보기 전(안내 화면) · starting 켜는 중 · live 화면에 나오는 중 ·
 * paused 사진을 고르느라 꺼 둠(다시 찍을 때 resume) ·
 * blocked 브라우저에서 막힘 · none 화면 안 카메라를 못 씀(카메라 없음·지원 안 함 → 휴대폰 카메라 앱으로)
 */
export type CameraState = 'checking' | 'ask' | 'starting' | 'live' | 'paused' | 'blocked' | 'none';

const canStream = () => Boolean(navigator.mediaDevices?.getUserMedia);

/** 화면 안 카메라 (영수증 촬영). 돌려준 video ref에 뒤 카메라를 비추고, capture로 지금 화면을 JPEG 파일로 찍는다 */
export function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>(() =>
    !canStream() ? 'none' : navigator.permissions ? 'checking' : 'ask',
  );
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  /** 요청 번호. 끄면 올려서, 진행 중이던 권한 조회·켜기 요청이 늦게 끝나도(성공이든 실패든) 버린다 */
  const attempt = useRef(0);
  /** 이 화면에서 한 번이라도 켜졌으면 권한이 있는 것 (다시 켤 때 권한 조회를 건너뛴다) */
  const granted = useRef(false);

  /** 켜 둔 카메라와 진행 중인 요청을 모두 버린다 */
  const release = useCallback(() => {
    attempt.current += 1;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  /** 끈다 (앨범에서 사진을 골랐을 때). 켜져 있었거나 켜는·확인하는 중이었으면 paused */
  const stop = useCallback(() => {
    release();
    setState((s) => (s === 'live' || s === 'starting' || s === 'checking' ? 'paused' : s));
  }, [release]);

  /** 켜기 (처음이면 브라우저가 권한을 묻는다). 막혀 있으면 blocked */
  const start = useCallback(async () => {
    setState('starting');
    const mine = ++attempt.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      // 켜는 사이에 화면을 떠났거나 꺼 달라고 했으면(앨범에서 사진을 고름) 바로 끈다
      if (!alive.current || mine !== attempt.current) {
        s.getTracks().forEach((t) => t.stop());
        return 'none' as const;
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = s;
      granted.current = true;
      setState('live');
      return 'live' as const;
    } catch (err) {
      const blocked =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      // 버린 요청의 실패가 새 요청의 상태를 덮어쓰지 않게
      if (alive.current && mine === attempt.current) setState(blocked ? 'blocked' : 'none');
      return blocked ? ('blocked' as const) : ('none' as const);
    }
  }, []);

  /** 이미 허용했으면 바로 켜고, 막혀 있으면 꺼짐 안내, 아직 모르면 안내 화면 */
  const check = useCallback(() => {
    const mine = attempt.current;
    const valid = () => alive.current && mine === attempt.current;
    navigator.permissions.query({ name: 'camera' as PermissionName }).then(
      (status) => {
        if (!valid()) return;
        if (status.state === 'granted') void start();
        else setState(status.state === 'denied' ? 'blocked' : 'ask');
      },
      // camera 권한 조회를 지원하지 않는 브라우저
      () => valid() && setState('ask'),
    );
  }, [start]);

  useEffect(() => {
    alive.current = true;
    if (canStream() && navigator.permissions) check();
  }, [check]);

  /** 꺼 둔(paused) 카메라를 다시 켠다. 켜진 적이 있으면 바로, 아니면 권한 확인부터 다시 */
  const resume = useCallback(() => {
    if (!canStream()) return;
    if (granted.current) {
      void start();
    } else if (navigator.permissions) {
      setState('checking');
      check();
    } else {
      setState('ask');
    }
  }, [check, start]);

  // 켜지면 화면에 붙인다
  useEffect(() => {
    if (state === 'live' && video.current) video.current.srcObject = stream.current;
  }, [state]);

  // 화면을 떠나면 끈다
  useEffect(
    () => () => {
      alive.current = false;
      release();
    },
    [release],
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

  return { video, state, start, stop, resume, capture };
}
