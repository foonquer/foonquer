import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './components/AppShell';
import { GuestOnly, RequireStep } from './components/RouteGuards';
import { TabLayout } from './components/TabLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { OAuthCallbackPage } from './pages/auth/OAuthCallbackPage';
import { OnboardingPage } from './pages/auth/OnboardingPage';
import { TermsPage } from './pages/auth/TermsPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/home/HomePage';
import { AddLocalRegionPage } from './pages/me/AddLocalRegionPage';
import { LocalRegionsPage } from './pages/me/LocalRegionsPage';
import { MyPage } from './pages/me/MyPage';
import { MyReviewsPage } from './pages/me/MyReviewsPage';
import { ProfileEditPage } from './pages/me/ProfileEditPage';
import { SettingsPage } from './pages/me/SettingsPage';
import { TasteWeightsPage } from './pages/me/TasteWeightsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfileSetupPage } from './pages/profile-setup/ProfileSetupPage';
import { RecommendationListPage } from './pages/recommendations/RecommendationListPage';
import { RecommendationsPage } from './pages/recommendations/RecommendationsPage';
import { RestaurantDetailPage } from './pages/restaurant/RestaurantDetailPage';
import { ConqueredPage } from './pages/review/ConqueredPage';
import { RatingPage } from './pages/review/RatingPage';
import { RestaurantReviewsPage } from './pages/review/RestaurantReviewsPage';
import { ReviewDetailPage } from './pages/review/ReviewDetailPage';
import { ReviewEditPage } from './pages/review/ReviewEditPage';
import { ReviewWritePage } from './pages/review/ReviewWritePage';
import { RewardPage } from './pages/review/RewardPage';
import { SearchPage } from './pages/search/SearchPage';
import { FollowPage } from './pages/visit/FollowPage';
import { OnSitePage } from './pages/visit/OnSitePage';
import { ReceiptPage } from './pages/visit/ReceiptPage';
import { VerificationPage } from './pages/visit/VerificationPage';
import { VisitNewPage } from './pages/visit/VisitNewPage';

/**
 * 다른 사람이 맡은 화면 자리 (준비 중). 화면을 만들면 element만 바꾼다.
 * 경로는 내 화면에서 이 화면으로 가는 버튼이 쓰고 있으니 바꾸면 같이 바꿔 주세요.
 */
const placeholders: RouteObject[] = [
  { path: '/notifications', element: <ComingSoonPage title="알림" /> },
  { path: '/me/mukkaebi', element: <ComingSoonPage title="내 먹깨비 꾸미기" /> },
  { path: '/me/conquests', element: <ComingSoonPage title="정복 기록" /> },
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
        ],
      },

      // 로그인 여부와 상관없이 (서버가 보내는 주소: 카카오 로그인 콜백)
      { path: '/oauth/callback', element: <OAuthCallbackPage /> }, // ?code= | ?error=
      // 약관 전문은 가입 화면에서도 연다 (다른 사람 담당, 준비 중)
      { path: '/terms', element: <ComingSoonPage title="이용약관 · 개인정보 처리방침" /> }, // ?type=

      // 카카오로 처음 가입해 약관 동의가 남은 회원
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
              { path: '/', element: <HomePage /> },
              { path: '/ranking', element: <ComingSoonPage title="랭킹/현황" tab /> },
              { path: '/recommendations', element: <RecommendationsPage /> }, // ?type=
              { path: '/list', element: <ComingSoonPage title="맛집 리스트" tab /> },
              { path: '/me', element: <MyPage /> },
            ],
          },
          { path: '/search', element: <SearchPage /> }, // ?keyword= | ?categoryId=&category=
          { path: '/restaurants/:restaurantId', element: <RestaurantDetailPage /> },
          { path: '/recommendations/list', element: <RecommendationListPage /> }, // ?type=
          { path: '/me/profile', element: <ProfileEditPage /> },
          { path: '/me/settings', element: <SettingsPage /> },
          { path: '/me/regions', element: <LocalRegionsPage /> },
          { path: '/me/regions/add', element: <AddLocalRegionPage /> },
          { path: '/me/taste', element: <TasteWeightsPage /> },
          { path: '/me/reviews', element: <MyReviewsPage /> },

          // 방문 인증 → 별점 → 정복 → 세부평가 → 적립
          { path: '/visits/new', element: <VisitNewPage /> }, // ?restaurantId= (없으면 홈 영수증)
          { path: '/visits/new/on-site', element: <OnSitePage /> }, // ?restaurantId=
          { path: '/visits/new/receipt', element: <ReceiptPage /> }, // ?restaurantId=
          { path: '/visits/:visitId', element: <VerificationPage /> },
          { path: '/visits/:visitId/follow', element: <FollowPage /> },
          { path: '/visits/:visitId/rating', element: <RatingPage /> },
          { path: '/visits/:visitId/conquered', element: <ConqueredPage /> },
          { path: '/visits/:visitId/review', element: <ReviewWritePage /> },
          { path: '/visits/:visitId/reward', element: <RewardPage /> },
          { path: '/restaurants/:restaurantId/reviews', element: <RestaurantReviewsPage /> },
          { path: '/reviews/:reviewId', element: <ReviewDetailPage /> },
          { path: '/reviews/:reviewId/edit', element: <ReviewEditPage /> },
          ...placeholders,
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
