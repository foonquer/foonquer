import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { saveRestaurant } from '../../api/saved';
import {
  confirmReceiptRestaurant,
  getVerification,
  type ReceiptCandidate,
  type Verification,
} from '../../api/visits';
import mukkaebi from '../../assets/illust/mukkaebi.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { formatDate, formatDateTime, formatDistance, formatWon, joinDot } from '../../lib/format';
import { iGa } from '../../lib/korean';
import { useAsync } from '../../lib/useAsync';
import type { Coords } from '../../lib/geolocation';
import { requestMyCoords } from '../../lib/useMyCoords';
import flow from './Flow.module.css';
import styles from './Visit.module.css';

/** 영수증을 읽는 동안 결과를 다시 물어보는 간격 (ms) */
const POLL_MS = 1500;
/** 다시 물어보는 최대 횟수 (1분). 서버가 다시 켜져 읽기가 끊기면 READING으로 남을 수 있다 */
const MAX_POLLS = 40;

/** 방문 인증 결과 /visits/:visitId (VISIT-04) — 읽는 중 · 이 가게가 맞나요? · 성공 · 실패 */
export function VerificationPage() {
  const visitId = Number(useParams().visitId);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [polls, setPolls] = useState(0);
  const { data, error, reload } = useAsync(
    () => getVerification(visitId, coords),
    [visitId, coords?.lat, coords?.lng],
  );

  // 후보 가게를 가까운 순으로 보여 주려고, 가게를 고를 때만 위치를 묻는다
  const checking = data?.status === 'RESTAURANT_CHECK';
  useEffect(() => {
    if (!checking) return;
    let alive = true;
    void requestMyCoords().then((c) => alive && c && setCoords(c));
    return () => {
      alive = false;
    };
  }, [checking]);

  // 영수증을 읽는 동안 다시 물어본다 (최대 MAX_POLLS번)
  const tooLong = data?.status === 'READING' && polls >= MAX_POLLS;
  useEffect(() => {
    if (data?.status !== 'READING' || tooLong) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      reload();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, reload, tooLong]);

  if (tooLong) {
    return (
      <Screen>
        <AppHeader title="방문 인증" />
        <EmptyState
          title="영수증을 읽는 데 시간이 오래 걸려요"
          description="잠시 뒤 다시 확인해 주세요."
          onRetry={() => {
            setPolls(0);
            reload();
          }}
        />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen>
        <AppHeader title="방문 인증" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="방문 인증" />
        <Loading />
      </Screen>
    );
  }

  switch (data.status) {
    case 'READING':
      return <Reading />;
    case 'RESTAURANT_CHECK':
      return <PickRestaurant v={data} onDone={reload} />;
    case 'VERIFIED':
      return <Verified v={data} />;
    case 'FAILED':
      return <Failed v={data} />;
    case 'CONQUERED':
      return <Navigate to={data.reviewId ? `/reviews/${data.reviewId}` : '/'} replace />;
    case 'LOCATION_CHECKED':
      return (
        <Navigate
          to={`/visits/new/on-site?restaurantId=${data.restaurant?.restaurantId ?? ''}`}
          replace
        />
      );
  }
}

function Reading() {
  return (
    <Screen>
      <AppHeader title="방문 인증" />
      <div className={flow.content}>
        <div className={flow.center}>
          <span className={styles.spinner} role="status" aria-label="영수증을 읽는 중" />
          <h2 className={flow.title}>영수증을 읽고 있어요</h2>
          <p className={flow.subtitle}>가게명·날짜·금액을 확인하는 중이에요</p>
        </div>
        <ol className={styles.reading}>
          <li data-state="done">
            <span>사진 올리기</span>
            <span>완료</span>
          </li>
          <li>
            <span>글자 읽기</span>
            <span>3초 정도</span>
          </li>
          <li>
            <span>가게와 맞춰 보기</span>
            <span />
          </li>
        </ol>
        <p className={styles.caption}>화면을 닫지 말고 잠시만 기다려 주세요</p>
      </div>
    </Screen>
  );
}

/** 홈 영수증: 읽은 가게명·사업자번호로 찾은 후보 중에서 고른다 (VISIT-05) */
function PickRestaurant({ v, onDone }: { v: Verification; onDone: () => void }) {
  const toast = useToast();
  const candidates = v.candidates ?? [];
  const [picked, setPicked] = useState<ReceiptCandidate | null>(candidates[0] ?? null);
  const [sending, setSending] = useState(false);

  const confirm = async () => {
    if (!picked) return;
    setSending(true);
    try {
      await confirmReceiptRestaurant(v.verificationId, picked.restaurantId);
      onDone();
    } catch (err) {
      toast(errorMessage(err));
      setSending(false);
    }
  };

  const [found, ...others] = candidates;
  const option = (c: ReceiptCandidate, note: string | null) => (
    <button
      key={c.restaurantId}
      type="button"
      role="radio"
      aria-checked={picked?.restaurantId === c.restaurantId}
      className={styles.candidate}
      onClick={() => setPicked(c)}
    >
      <span className={styles.candidateName}>{c.name}</span>
      <span className={styles.candidateMeta}>
        {joinDot([c.categoryName, c.roadAddress, formatDistance(c.distanceM), note])}
      </span>
      <span className={styles.match}>
        ✓ {c.matchedBy === 'BUSINESS_NO' ? '사업자번호 일치' : '가게명 일치'}
      </span>
    </button>
  );

  return (
    <Screen
      footer={
        <>
          <p className={styles.caption}>고른 가게와 영수증이 다르면 인증되지 않아요</p>
          <Button onClick={confirm} disabled={!picked || sending}>
            {picked ? `${iGa(picked.name)} 맞아요` : '가게를 골라 주세요'}
          </Button>
        </>
      }
    >
      <AppHeader title="방문 인증" />
      <div className={styles.content}>
        <h2 className={styles.title}>이 가게가 맞나요?</h2>
        <p className={styles.description}>영수증에서 읽은 정보로 가게를 찾았어요</p>
        <ReceiptInfo v={v} />
        {found ? (
          <div role="radiogroup" aria-label="인증할 가게" className={styles.candidates}>
            <p className={styles.sectionTitle}>찾은 가게</p>
            {option(found, null)}
            {others.length > 0 && <p className={styles.sectionTitle}>다른 가게인가요?</p>}
            {others.map((c) => option(c, '이름이 같은 다른 지점'))}
          </div>
        ) : (
          <p className={styles.description}>영수증의 가게를 찾지 못했어요. 검색해서 찾아 주세요.</p>
        )}
        <Link to="/search" className={styles.searchLink}>
          <span>검색해서 직접 찾기</span>
          <span aria-hidden="true">›</span>
        </Link>
      </div>
    </Screen>
  );
}

function ReceiptInfo({ v }: { v: Verification }) {
  if (!v.receipt) return null;
  return (
    <section className={styles.receiptInfo} aria-label="영수증에서 읽은 정보">
      <p className={styles.receiptInfoTitle}>영수증에서 읽은 정보</p>
      <p>
        가게명 <strong>{v.receipt.storeName ?? '–'}</strong>
      </p>
      <p>
        결제 <strong>{formatDateTime(v.receipt.paidAt) ?? '–'}</strong>
      </p>
      <p>
        금액 <strong>{formatWon(v.receipt.totalAmount) ?? '–'}</strong>
      </p>
    </section>
  );
}

function Verified({ v }: { v: Verification }) {
  const navigate = useNavigate();
  const receipt = v.method === 'RECEIPT';
  return (
    <Screen
      footer={
        <Button onClick={() => navigate(`/visits/${v.verificationId}/rating`, { replace: true })}>
          별점 남기러 가기
        </Button>
      }
    >
      <AppHeader title="방문 인증" />
      <div className={flow.content}>
        <div className={flow.center}>
          <img src={mukkaebi} alt="" className={flow.mukkaebi} />
          <h2 className={flow.title}>방문 인증이 완료됐어요!</h2>
          <p className={flow.subtitle}>이제 별점을 남기면 정복 준비가 끝나요.</p>
        </div>
        <section className={flow.card} aria-label="인증한 가게">
          <p className={flow.cardName}>{v.restaurant?.name}</p>
          <p className={flow.cardMeta}>{v.restaurant?.categoryName}</p>
          <div className={flow.rows}>
            <p className={flow.row}>
              <span>방문 날짜</span>
              <strong>{formatDate(v.receipt?.paidAt ?? v.verifiedAt)}</strong>
            </p>
            {receipt && v.receipt?.totalAmount != null && (
              <p className={flow.row}>
                <span>결제 금액</span>
                <strong>{formatWon(v.receipt.totalAmount)}</strong>
              </p>
            )}
          </div>
        </section>
        <section className={flow.tip}>
          <p className={flow.tipTitle}>1단계 완료 · {receipt ? '영수증 인증' : '현장 인증'}</p>
          <p className={flow.tipText}>별점까지 등록해야 정복이 완료돼요.</p>
        </section>
      </div>
    </Screen>
  );
}

type FailCopy = {
  title: string;
  description: string;
  checks: string[];
  primary: { label: string; action: 'RETAKE' | 'SEARCH' | 'SAVE' | 'HOME' | 'RESTAURANT' };
  secondary: { label: string; action: 'RETAKE' | 'SUPPORT' | 'HOME' | 'PICK_ANOTHER' };
};

/** 실패 이유별 문구 (피그마 4. 방문 인증 / 인증 실패 4종) */
function failCopy(v: Verification): FailCopy {
  const name = v.restaurant?.name;
  switch (v.failReason) {
    case 'DUPLICATE':
      return {
        title: '이미 인증한 영수증이에요',
        description:
          '같은 영수증은 한 번만 인증할 수 있어요.\n새로 방문했다면 그날 받은 영수증을 찍어 주세요.',
        checks: [
          '오늘 받은 영수증인가요?',
          '다른 사람이 인증한 영수증은 쓸 수 없어요',
          '문제가 있다면 고객센터로 알려 주세요',
        ],
        primary: { label: '다른 영수증 촬영하기', action: 'RETAKE' },
        secondary: { label: '고객센터 문의', action: 'SUPPORT' },
      };
    case 'STORE_MISMATCH':
    case 'STORE_NOT_FOUND':
      return {
        title: '가게 정보가 달라요',
        description:
          '영수증의 가게가 선택한 맛집과 달라요.\n가게 이름과 지점을 한 번 더 확인해 주세요.',
        checks: [
          name ? `${name} 영수증이 맞나요?` : '인증할 가게의 영수증이 맞나요?',
          '이름이 같은 다른 지점일 수 있어요',
          '지점이 다르면 검색에서 다시 찾아 주세요',
        ],
        primary: { label: '맛집 다시 선택하기', action: 'SEARCH' },
        secondary: { label: '다시 촬영하기', action: 'RETAKE' },
      };
    case 'EXPIRED': {
      const paid = formatDate(v.receipt?.paidAt);
      return {
        title: '7일이 지난 영수증이에요',
        description:
          '방문 인증은 결제일로부터 7일 안에만 할 수 있어요.\n다음 방문 때 바로 인증해 보세요!',
        checks: [
          paid ? `결제일: ${paid}` : '결제일을 확인해 주세요',
          '7일 이내 영수증만 인증돼요',
          '가고 싶은 곳에 저장하면 다음에 알려 드릴게요',
        ],
        primary: v.restaurant
          ? { label: '가고 싶은 곳에 저장', action: 'SAVE' }
          : { label: '홈으로', action: 'HOME' },
        secondary: {
          label: v.restaurant ? '홈으로' : '다른 영수증 촬영하기',
          action: v.restaurant ? 'HOME' : 'PICK_ANOTHER',
        },
      };
    }
    case 'ALREADY_VERIFIED':
      return {
        title: '이미 인증한 가게예요',
        description: v.failMessage ?? '이 가게는 오늘 이미 인증했어요.',
        checks: [
          '같은 가게는 하루에 한 번 인증할 수 있어요',
          '별점을 남기지 않은 인증이 있으면 먼저 별점을 남겨 주세요',
          '내일 다시 인증할 수 있어요',
        ],
        primary: v.restaurant
          ? { label: '가게 보러 가기', action: 'RESTAURANT' }
          : { label: '홈으로', action: 'HOME' },
        secondary: { label: '홈으로', action: 'HOME' },
      };
    default:
      return {
        title: '영수증을 읽기 어려워요',
        description:
          '사진이 흐리거나 일부가 잘렸을 수 있어요.\n아래 내용을 확인하고 다시 시도해 주세요.',
        checks: [
          '가게명과 방문 날짜가 보이나요?',
          '결제 금액이 잘리지 않았나요?',
          '글자가 선명하고 빛 반사가 없나요?',
        ],
        primary: { label: '다시 촬영하기', action: 'RETAKE' },
        secondary: { label: '다른 사진 선택', action: 'PICK_ANOTHER' },
      };
  }
}

function Failed({ v }: { v: Verification }) {
  const navigate = useNavigate();
  const toast = useToast();
  const copy = failCopy(v);
  const retake = `/visits/new${v.restaurant ? `/receipt?restaurantId=${v.restaurant.restaurantId}` : ''}`;

  const run = async (action: FailCopy['primary']['action'] | FailCopy['secondary']['action']) => {
    switch (action) {
      case 'RETAKE':
      case 'PICK_ANOTHER':
        navigate(retake, { replace: true });
        return;
      case 'SEARCH':
        navigate('/search');
        return;
      case 'SUPPORT':
        navigate('/support');
        return;
      case 'HOME':
        navigate('/', { replace: true });
        return;
      case 'RESTAURANT':
        navigate(`/restaurants/${v.restaurant?.restaurantId}`, { replace: true });
        return;
      case 'SAVE':
        try {
          await saveRestaurant(v.restaurant?.restaurantId as number);
          toast({
            message: '가고 싶은 곳에 저장했어요',
            check: true,
            action: { label: '리스트 보기', to: '/list' },
          });
        } catch (err) {
          toast(errorMessage(err));
        }
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button onClick={() => run(copy.primary.action)}>{copy.primary.label}</Button>
          <Button variant="white" onClick={() => run(copy.secondary.action)}>
            {copy.secondary.label}
          </Button>
        </>
      }
    >
      <AppHeader title="방문 인증" />
      <div className={flow.content}>
        <div className={flow.center}>
          <span className={flow.warn} aria-hidden="true">
            !
          </span>
          <h2 className={flow.title}>{copy.title}</h2>
          <p className={flow.subtitle}>{copy.description}</p>
        </div>
        <ol className={flow.checklist}>
          {copy.checks.map((c, i) => (
            <li key={c}>
              {i + 1}. {c}
            </li>
          ))}
        </ol>
      </div>
    </Screen>
  );
}
