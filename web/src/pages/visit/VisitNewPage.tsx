import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import location from '../../assets/icons/location.svg';
import receipt from '../../assets/icons/receipt.svg';
import { AppHeader } from '../../components/AppHeader';
import { Screen } from '../../components/Screen';
import { formatTime } from '../../lib/format';
import { pendingOnSite } from '../../lib/pendingOnSite';
import styles from './Visit.module.css';

/**
 * 방문 인증 시작 /visits/new?restaurantId= — 현장인증과 영수증 인증 중에서 고른다.
 * 홈에서 바로 왔으면(가게 없음) 현장인증은 내 위치로 가게를 찾고, 영수증 인증은 영수증으로 가게를 찾는다.
 */
export function VisitNewPage() {
  const [params] = useSearchParams();
  const id = Number(params.get('restaurantId'));
  const query = Number.isInteger(id) && id > 0 ? `?restaurantId=${id}` : '';
  // 위치만 확인해 두고 사진을 아직 안 올린 현장인증이 있으면 이어서 하기
  const [pending] = useState(() => pendingOnSite.get());
  const until = formatTime(pending?.check.expiresAt);

  return (
    <Screen>
      <AppHeader title="방문 인증" />
      <div className={styles.content}>
        <h2 className={styles.title}>어떻게 방문을 인증할까요?</h2>
        <p className={styles.description}>내 상황에 맞는 방법으로 맛집을 정복해요.</p>

        {pending && (
          <Link
            to={`/visits/new/on-site?restaurantId=${pending.restaurantId}`}
            className={styles.resume}
          >
            <span>
              <span className={styles.resumeTitle}>{pending.restaurantName} 이어서 인증하기</span>
              <span className={styles.resumeText}>
                위치 확인 완료 · {until ? `${until}까지 ` : ''}음식 사진만 올리면 돼요
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        )}

        <Link to={`/visits/new/on-site${query}`} className={styles.method}>
          <span className={styles.recommend}>추천 방법</span>
          <span className={styles.methodTitle}>
            <img src={location} alt="" width={20} height={24} />
            현장인증
          </span>
          <span className={styles.methodSub}>위치 확인 · 갤러리 음식사진</span>
          <span className={styles.methodText}>영수증이 없어도 방문을 확인할 수 있어요.</span>
        </Link>

        <Link to={`/visits/new/receipt${query}`} className={styles.method}>
          <span className={styles.methodTitle}>
            <img src={receipt} alt="" width={20} height={22} />
            영수증 인증
          </span>
          <span className={styles.methodSub}>영수증 촬영</span>
          <span className={styles.methodText}>영수증이 있다면 기존 방식으로 인증해요.</span>
        </Link>

        <div className={styles.info}>
          <p className={styles.infoTitle}>인증 방법은 한 가지만 선택하면 돼요</p>
          <p className={styles.infoText}>두 방법 모두 같은 맛집의 정복 기록으로 남아요.</p>
        </div>
      </div>
    </Screen>
  );
}
