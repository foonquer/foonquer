import { createBrowserRouter, type RouteObject } from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

// 화면을 추가할 때 여기에 경로를 붙인다. 예) { path: '/restaurants/:id', element: <RestaurantPage /> }
export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
