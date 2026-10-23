import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../router';

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('홈', () => {
  it('서버가 성공 응답을 주면 "서버 연결됨"', async () => {
    mockFetch(200, { success: true, data: { status: 'ok' }, message: '요청에 성공했습니다.' });
    renderAt('/');

    expect(await screen.findByText('서버 연결됨')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('서버가 에러 응답을 주면 서버의 message를 보여 준다', async () => {
    mockFetch(500, { success: false, code: 'COMMON_500', message: '서버 오류가 발생했습니다.' });
    renderAt('/');

    expect(await screen.findByText(/서버 오류가 발생했습니다/)).toBeInTheDocument();
  });
});

describe('없는 주소', () => {
  it('찾을 수 없음 화면', () => {
    mockFetch(200, {});
    renderAt('/nope');

    expect(screen.getByText('페이지를 찾을 수 없어요')).toBeInTheDocument();
  });
});
