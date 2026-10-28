import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { resetSessionForTest, type Session } from '../lib/session';
import { routes } from '../router';

type Options = {
  /** 로그인 상태 (기본: 활성 회원) */
  session?: Session;
  /** 이전 화면에서 넘겨준 location.state */
  state?: unknown;
};

/** 실제 라우트 목록으로 그 경로의 화면을 그린다. 지금 경로는 router.state.location으로 본다 */
export function renderRoute(path: string, { session, state }: Options = {}) {
  const next = session ?? { status: 'authed', nextAction: 'HOME' };
  resetSessionForTest(next, next.status === 'authed' ? 'test-access-token' : undefined);
  const router = createMemoryRouter(routes, {
    initialEntries: [{ ...toEntry(path), state }],
  });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router };
}

function toEntry(path: string) {
  const url = new URL(path, 'http://localhost');
  return { pathname: url.pathname, search: url.search };
}
