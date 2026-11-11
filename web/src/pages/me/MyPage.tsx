import { Link } from 'react-router';
import { getHomeSummary } from '../../api/home';
import { AGE_LABEL, GENDER_LABEL, getMe, getMySummary } from '../../api/users';
import chevron from '../../assets/icons/chevron-right.svg';
import gearIcon from '../../assets/icons/gear.svg';
import { MenuList } from '../../components/MenuList';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { NotificationBell } from '../../components/NotificationBell';
import { Screen } from '../../components/Screen';
import { EmptyState } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { wearingOf } from '../../lib/wearing';
import styles from './MyPage.module.css';

/** 내 정보 탭: 프로필 카드(USER-04), 시즌 나의 기록과 메뉴 숫자(USER-08) */
export function MyPage() {
  const me = useAsync(getMe, []);
  const summary = useAsync(getMySummary, []).data;
  // 안 읽은 알림 수와 먹깨비 착용 아이템 (홈과 같은 HOME-01) — 못 받아도 화면은 그대로
  const home = useAsync(getHomeSummary, []).data;
  const record = summary?.seasonRecord;
  const first = me.data?.localRegions[0];

  return (
    <Screen inTab>
      <header className={styles.header}>
        <h1 className={styles.title}>내 정보</h1>
        <NotificationBell unread={home?.unreadNotificationCount ?? 0} className={styles.bell} />
        <Link to="/me/settings" className={styles.settings} aria-label="설정">
          <img src={gearIcon} alt="" width={24} height={24} />
        </Link>
      </header>

      <div className={styles.content}>
        {me.error ? (
          <EmptyState title={errorMessage(me.error)} onRetry={me.reload} />
        ) : (
          <Link to="/me/profile" className={styles.profile} aria-label="프로필 수정">
            <MukkaebiAvatar
              size={64}
              stage={home?.mukkaebi.stage}
              wearing={home ? wearingOf(home.mukkaebi) : undefined}
            />
            <span className={styles.profileText}>
              <span className={styles.nickname}>{me.data?.nickname ?? ' '}</span>
              {summary?.title && <span className={styles.titleChip}>{summary.title}</span>}
              <span className={styles.profileSub}>
                {me.data &&
                  joinDot([
                    first ? `${first.sigunguName} ${first.dongName}` : null,
                    me.data.gender && me.data.gender !== 'N' ? GENDER_LABEL[me.data.gender] : null,
                    me.data.ageGroup ? AGE_LABEL[me.data.ageGroup] : null,
                  ])}
              </span>
            </span>
            <img src={chevron} alt="" width={6} height={11} />
          </Link>
        )}

        {summary?.season && record && (
          <Link
            to="/me/seasons"
            className={styles.season}
            aria-label={`${summary.season.name} 나의 기록`}
          >
            <span className={styles.seasonHead}>
              <span>{summary.season.name} · 나의 기록</span>
              <span>D-{summary.season.daysLeft}</span>
            </span>
            <span className={styles.seasonStats}>
              <span>
                <strong>{record.conquestCount}곳</strong>정복
              </span>
              <span>
                <strong>{record.reviewCount}개</strong>리뷰
              </span>
              <span>
                <strong>{record.helpfulReceived}</strong>도움돼요
              </span>
            </span>
            {record.main && (
              <span className={styles.seasonFoot}>
                {record.main.sigunguName} {record.main.rank ? `${record.main.rank}위` : '순위 없음'}
                {record.main.mukjjangGap > 0
                  ? ` · 먹짱까지 ${record.main.mukjjangGap}곳`
                  : record.main.rank
                    ? ' · 먹짱'
                    : ''}
              </span>
            )}
          </Link>
        )}

        <MenuList
          label="내 기록"
          items={[
            {
              label: '내 먹깨비 꾸미기',
              value: summary?.newItemCount ? `새 아이템 ${summary.newItemCount}` : undefined,
              to: '/me/mukkaebi',
            },
            {
              label: '정복 기록',
              value: record ? `${record.conquestCount}곳` : undefined,
              to: '/me/conquests',
            },
            { label: '내 리뷰', to: '/me/reviews' },
            { label: '퀘스트 기록', to: '/me/quests' },
            { label: '내 모임', to: '/me/crews' },
            {
              label: '시즌 기록 · 칭호',
              value: summary ? `칭호 ${summary.titleCount}개` : undefined,
              to: '/me/seasons',
            },
            {
              label: '저장한 맛집',
              value: summary ? `${summary.savedRestaurantCount}곳` : undefined,
              to: '/list',
            },
            {
              label: '내 PICK',
              value: summary ? `${summary.pickCount}곳` : undefined,
              to: '/me/pick',
            },
          ]}
        />

        {me.data?.isAdmin && (
          <MenuList label="운영" items={[{ label: '운영 관리 · 신고·문의 처리', to: '/admin' }]} />
        )}

        <div className={styles.etc}>
          <Link to="/notices">공지사항</Link>
          <Link to="/support">고객센터</Link>
        </div>
      </div>
    </Screen>
  );
}
