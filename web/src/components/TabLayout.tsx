import { NavLink, Outlet, useLocation } from 'react-router';
import tabHome from '../assets/icons/tab-home.svg';
import tabList from '../assets/icons/tab-list.svg';
import tabMe from '../assets/icons/tab-me.svg';
import tabRanking from '../assets/icons/tab-ranking.svg';
import tabReco from '../assets/icons/tab-reco.svg';
import { CelebrationLayer } from './CelebrationLayer';
import { Icon } from './Icon';
import styles from './TabLayout.module.css';

// Figma 하단 내비게이션. 아이콘 그림 크기는 22px 상자 안 실제 그림 크기
const TABS = [
  { to: '/', label: '홈', icon: tabHome, w: 18.15, h: 18.15 },
  { to: '/ranking', label: '랭킹/현황', icon: tabRanking, w: 16.32, h: 18.15 },
  { to: '/recommendations', label: '추천맛집', icon: tabReco, w: 19.98, h: 19.07 },
  { to: '/list', label: '맛집 리스트', icon: tabList, w: 12.65, h: 19.07 },
  { to: '/me', label: '내 정보', icon: tabMe, w: 16.32, h: 18.15 },
] as const;

/** 하단 탭이 있는 화면들의 틀. 안 본 축하는 탭 화면 어디서든 띄운다 (화면을 옮길 때마다 다시 확인) */
export function TabLayout() {
  const { pathname } = useLocation();
  return (
    <div className={styles.layout}>
      <Outlet />
      <CelebrationLayer key={pathname} />
      <nav className={styles.tabBar} aria-label="하단 메뉴">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end className={styles.tab}>
            <Icon src={tab.icon} size={22} width={tab.w} height={tab.h} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
