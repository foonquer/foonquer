import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './components/AppShell';
import { GuestOnly, RequireStep } from './components/RouteGuards';
import { TabLayout } from './components/TabLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { OAuthCallbackPage } from './pages/auth/OAuthCallbackPage';
import { OnboardingPage } from './pages/auth/OnboardingPage';
import { TermsPage } from './pages/auth/TermsPage';
import { HomePage } from './pages/home/HomePage';
import { ListAddPage } from './pages/list/ListAddPage';
import { ListPage } from './pages/list/ListPage';
import { AddLocalRegionPage } from './pages/me/AddLocalRegionPage';
import { ConquestsPage } from './pages/me/ConquestsPage';
import { LocalRegionsPage } from './pages/me/LocalRegionsPage';
import { MyPage } from './pages/me/MyPage';
import { MyReviewsPage } from './pages/me/MyReviewsPage';
import { PickEditPage } from './pages/me/PickEditPage';
import { ProfileEditPage } from './pages/me/ProfileEditPage';
import { WithdrawPage } from './pages/me/WithdrawPage';
import { CollectionPage } from './pages/mukkaebi/CollectionPage';
import { DecoratePage } from './pages/mukkaebi/DecoratePage';
import { ItemBoxesPage } from './pages/mukkaebi/ItemBoxesPage';
import { MukkaebiPage } from './pages/mukkaebi/MukkaebiPage';
import { PointsPage } from './pages/mukkaebi/PointsPage';
import { ShopPage } from './pages/mukkaebi/ShopPage';
import { SeasonsPage } from './pages/me/SeasonsPage';
import { SettingsPage } from './pages/me/SettingsPage';
import { TasteWeightsPage } from './pages/me/TasteWeightsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RankingPage } from './pages/ranking/RankingPage';
import { SigunguRankingPage } from './pages/ranking/SigunguRankingPage';
import { SigunguStatusPage } from './pages/ranking/SigunguStatusPage';
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
import { NoticesPage } from './pages/support/NoticesPage';
import { NotificationsPage } from './pages/support/NotificationsPage';
import { SupportPage } from './pages/support/SupportPage';
import { TermsViewPage } from './pages/support/TermsViewPage';
import { FollowPage } from './pages/visit/FollowPage';
import { OnSitePage } from './pages/visit/OnSitePage';
import { ReceiptPage } from './pages/visit/ReceiptPage';
import { VerificationPage } from './pages/visit/VerificationPage';
import { VisitNewPage } from './pages/visit/VisitNewPage';
import { ExplorerProfilePage } from './pages/explorer/ExplorerProfilePage';
import { PickMapPage } from './pages/explorer/PickMapPage';
import { ReportPage } from './pages/explorer/ReportPage';

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
      // 약관 전문은 가입 화면에서도 연다 (CS-07은 로그인 없이)
      { path: '/terms', element: <TermsViewPage /> }, // ?type=&version=

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
              { path: '/ranking', element: <RankingPage /> }, // ?tab=status|rank&seasonId=
              { path: '/recommendations', element: <RecommendationsPage /> }, // ?type=
              { path: '/list', element: <ListPage /> }, // ?tab=WANT|CONQUERED
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
          { path: '/me/conquests', element: <ConquestsPage /> }, // ?seasonId=
          { path: '/me/seasons', element: <SeasonsPage /> },
          { path: '/me/pick', element: <PickEditPage /> },
          { path: '/me/mukkaebi', element: <MukkaebiPage /> },
          { path: '/me/mukkaebi/decorate', element: <DecoratePage /> }, // ?tab=
          { path: '/me/mukkaebi/shop', element: <ShopPage /> }, // ?category=
          { path: '/me/mukkaebi/collection', element: <CollectionPage /> },
          { path: '/me/mukkaebi/boxes', element: <ItemBoxesPage /> },
          { path: '/me/points', element: <PointsPage /> },
          { path: '/me/withdraw', element: <WithdrawPage /> },
          { path: '/users/:userId', element: <ExplorerProfilePage /> }, // ?tab=pick|visited|reviews
          { path: '/users/:userId/picks', element: <PickMapPage /> },
          { path: '/users/:userId/report', element: <ReportPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/notices', element: <NoticesPage /> }, // ?noticeId=
          { path: '/support', element: <SupportPage /> }, // ?inquiryId=
          { path: '/list/add', element: <ListAddPage /> },
          { path: '/ranking/sigungus/:sigunguId', element: <SigunguRankingPage /> }, // ?seasonId=
          { path: '/ranking/sigungus/:sigunguId/status', element: <SigunguStatusPage /> },

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
          { path: '/reviews/:reviewId/report', element: <ReportPage /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
