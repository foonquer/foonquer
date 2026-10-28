import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './components/AppShell';
import { GuestOnly, RequireStep } from './components/RouteGuards';
import { TabLayout } from './components/TabLayout';
import { AccountLinkPage } from './pages/auth/AccountLinkPage';
import { EmailLoginPage } from './pages/auth/EmailLoginPage';
import { EmailSignupPage } from './pages/auth/EmailSignupPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { OAuthCallbackPage } from './pages/auth/OAuthCallbackPage';
import { OnboardingPage } from './pages/auth/OnboardingPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { TermsPage } from './pages/auth/TermsPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfileSetupPage } from './pages/profile-setup/ProfileSetupPage';

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
];

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      // 로그인 전 (로그인하면 다음 단계로 보낸다)
      {
        element: <GuestOnly />,
        children: [
          { path: '/onboarding', element: <OnboardingPage /> },
          { path: '/login', element: <LoginPage /> },
          { path: '/login/email', element: <EmailLoginPage /> },
          { path: '/signup/email', element: <EmailSignupPage /> },
          { path: '/password/forgot', element: <ForgotPasswordPage /> },
          { path: '/oauth/link', element: <AccountLinkPage /> },
        ],
      },

      // 로그인 여부와 상관없이 (서버가 보내는 주소: 소셜 로그인 콜백, 비밀번호 재설정 메일 링크)
      { path: '/oauth/callback', element: <OAuthCallbackPage /> }, // ?code= | ?error=
      { path: '/password/reset', element: <ResetPasswordPage /> }, // ?token=
      // 약관 전문은 가입 화면에서도 연다 (다른 사람 담당, 준비 중)
      { path: '/terms', element: <ComingSoonPage title="이용약관 · 개인정보 처리방침" /> }, // ?type=

      // 소셜로 처음 가입해 약관 동의가 남은 회원
      {
        element: <RequireStep step="TERMS_REQUIRED" />,
        children: [{ path: '/signup/terms', element: <TermsPage /> }],
      },

      // 프로필 설정이 남은 회원 (S-04 ~ S-07)
      {
        element: <RequireStep step="PROFILE_REQUIRED" />,
        children: [{ path: '/profile/setup', element: <ProfileSetupPage /> }], // ?step=info|region
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
