import { Link } from 'react-router';
import { AGE_LABEL, GENDER_LABEL, getMe } from '../../api/users';
import bellIcon from '../../assets/icons/bell.svg';
import chevron from '../../assets/icons/chevron-right.svg';
import { MenuList } from '../../components/MenuList';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { Screen } from '../../components/Screen';
import { EmptyState } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { joinDot } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import styles from './MyPage.module.css';

/** 내 정보 탭: 프로필 카드(USER-04)와 메뉴. 시즌 기록·리뷰 수 등은 담당 화면에서 채운다 */
export function MyPage() {
  const me = useAsync(getMe, []);
  const first = me.data?.localRegions[0];

  return (
    <Screen inTab>
      <header className={styles.header}>
        <h1 className={styles.title}>내 정보</h1>
        <Link to="/notifications" className={styles.bell} aria-label="알림">
          <img src={bellIcon} alt="" width={24} height={24} />
        </Link>
        <Link to="/me/settings" className={styles.settings}>
          설정
        </Link>
      </header>

      <div className={styles.content}>
        {me.error ? (
          <EmptyState title={errorMessage(me.error)} onRetry={me.reload} />
        ) : (
          <Link to="/me/profile" className={styles.profile} aria-label="프로필 수정">
            <MukkaebiAvatar size={64} />
            <span className={styles.profileText}>
              <span className={styles.nickname}>{me.data?.nickname ?? ' '}</span>
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

        <MenuList
          label="내 기록"
          items={[
            { label: '내 먹깨비 꾸미기', to: '/me/mukkaebi' },
            { label: '정복 기록', to: '/me/conquests' },
            { label: '내 리뷰', to: '/me/reviews' },
            { label: '시즌 기록 · 칭호', to: '/me/seasons' },
            { label: '저장한 맛집', to: '/list' },
            { label: '내 PICK', to: '/me/pick' },
          ]}
        />

        <div className={styles.etc}>
          <Link to="/notices">공지사항</Link>
          <Link to="/support">고객센터</Link>
        </div>
      </div>
    </Screen>
  );
}
