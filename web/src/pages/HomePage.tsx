import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

type ServerStatus = 'checking' | 'ok' | 'down';

// 임시 홈 화면: 서버 연결 확인용. 실제 홈(지도) 화면으로 바꾼다.
export function HomePage() {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    api
      .get<{ status: string }>('/health')
      .then(() => setStatus('ok'))
      .catch((e: unknown) => {
        setStatus('down');
        setDetail(e instanceof ApiError ? e.message : String(e));
      });
  }, []);

  return (
    <main className="page">
      <h1>먹장깨기</h1>
      <p>우리 동네 맛집 정복 앱</p>
      <p className="status" data-status={status}>
        {status === 'checking' && '서버 확인 중…'}
        {status === 'ok' && '서버 연결됨'}
        {status === 'down' && `서버 연결 안 됨: ${detail}`}
      </p>
    </main>
  );
}
