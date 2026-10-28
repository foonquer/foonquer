import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './components/AppShell';
import { GuestOnly, RequireStep } from './components/RouteGuards';
import { TabLayout } from './components/TabLayout';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * 다른 사람이 맡은 화면 자리 (준비 중). 화면을 만들면 element만 바꾼다.
 * 경로는 내 화면에서 이 화면으로 가는 버튼이 쓰고 있으니 바꾸면 같이 바꿔 주세요.
 */
const placeholders: RouteObject[] = [
  { path: '/notifications', element: <ComingSoonPage title="알림" /> },
  { path: '/visits/new', element: <ComingSoonPage title="방문 인증" /> }, // ?restaurantId=
  { path: '/visits/:visitId/follow', element: <ComingSoonPage title="먹깨비 따라가기" /> },
  { path: '/reviews/:reviewId', element: <ComingSoonPage title="내 리뷰" /> },
  {
    path: '/restaurants/:restaurantId/reviews',
    element: <ComingSoonPage title="방문 인증 리뷰" />,
  },
  { path: '/me/mukkaebi', element: <ComingSoonPage title="내 먹깨비 꾸미기" /> },
  { path: '/me/conquests', element: <ComingSoonPage title="정복 기록" /> },
  { path: '/me/reviews', element: <ComingSoonPage title="내 리뷰" /> },
  { path: '/me/seasons', element: <ComingSoonPage title="시즌 기록 · 칭호" /> },
  { path: '/me/pick', element: <ComingSoonPage title="내 PICK" /> },
  { path: '/me/withdraw', element: <ComingSoonPage title="회원 탈퇴" /> },
  { path: '/notices', element: <ComingSoonPage title="공지사항" /> },
  { path: '/support', element: <ComingSoonPage title="고객센터" /> },
  { path: '/terms', element: <ComingSoonPage title="이용약관 · 개인정보 처리방침" /> }, // ?type=
];

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      // 로그인 전 (로그인하면 다음 단계로 보낸다)
      {
        element: <GuestOnly />,
        children: [
          { path: '/onboarding', element: <ComingSoonPage title="온보딩" /> },
          { path: '/login', element: <ComingSoonPage title="로그인" /> },
        ],
      },

      // 로그인한 활성 회원
      {
        element: <RequireStep step="HOME" />,
        children: [
          {
            element: <TabLayout />,
            children: [
              { path: '/', element: <ComingSoonPage title="홈" tab /> },
              { path: '/ranking', element: <ComingSoonPage title="랭킹/현황" tab /> },
              { path: '/recommendations', element: <ComingSoonPage title="추천맛집" tab /> },
              { path: '/list', element: <ComingSoonPage title="맛집 리스트" tab /> },
              { path: '/me', element: <ComingSoonPage title="내 정보" tab /> },
            ],
          },
          ...placeholders,
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
