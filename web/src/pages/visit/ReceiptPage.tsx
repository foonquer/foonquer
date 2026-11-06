import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { RECEIPT_ACCEPT, uploadImage } from '../../api/uploads';
import { submitReceipt } from '../../api/visits';
import receiptIcon from '../../assets/icons/receipt.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { useCamera } from '../../lib/useCamera';
import flow from './Flow.module.css';
import styles from './Visit.module.css';

type Photo = { file: File; url: string };

/** 앨범에서 고르기 (파일 고르기 창). 카메라 안내·꺼짐 화면 아래 버튼 */
function AlbumButton({
  onPick,
  label,
}: {
  onPick: (files: FileList | null) => void;
  label: string;
}) {
  return (
    <label className={styles.fileButton} data-variant="white" data-full="true">
      {label}
      <input type="file" accept={RECEIPT_ACCEPT} onChange={(e) => onPick(e.target.files)} />
    </label>
  );
}

/**
 * 영수증 인증 /visits/new/receipt?restaurantId= (홈에서 바로 찍으면 /visits/new, 가게 없음)
 * 화면 안 카메라(권한 안내·꺼짐 안내) 또는 앨범 → 촬영 확인 → 업로드 + VISIT-03 → 결과 화면(/visits/:id)에서 읽는 중·성공·실패.
 * 화면 안 카메라를 못 쓰는 브라우저면 휴대폰 카메라 앱으로 찍는다
 */
export function ReceiptPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const id = Number(params.get('restaurantId'));
  const restaurantId = Number.isInteger(id) && id > 0 ? id : undefined;
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [sending, setSending] = useState(false);
  const { video, state: cam, start: startCamera, stop: stopCamera, capture } = useCamera();

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    stopCamera();
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const shoot = async () => {
    const file = await capture();
    if (!file) {
      toast('사진을 찍지 못했어요. 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    stopCamera();
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const retake = () => {
    setPhoto(null);
    if (cam === 'live') void startCamera();
  };

  const retry = async () => {
    if ((await startCamera()) === 'blocked') toast('아직 카메라가 꺼져 있어요');
  };

  const submit = async () => {
    if (!photo) return;
    setSending(true);
    try {
      const receiptImageKey = await uploadImage(photo.file, 'RECEIPT');
      const { verificationId } = await submitReceipt({ restaurantId, receiptImageKey });
      navigate(`/visits/${verificationId}`, { replace: true });
    } catch (err) {
      setSending(false);
      const pending =
        err instanceof ApiError && err.code === 'VISIT_PENDING_RATING'
          ? (err.data as { verificationId?: number } | null)?.verificationId
          : undefined;
      toast(
        pending
          ? {
              message: errorMessage(err),
              action: { label: '별점 남기러 가기', to: `/visits/${pending}/rating` },
            }
          : errorMessage(err),
      );
    }
  };

  if (photo) {
    return (
      <Screen
        footer={
          <>
            <Button onClick={submit} disabled={sending}>
              {sending ? '사진을 올리는 중…' : '이 사진으로 인증하기'}
            </Button>
            <Button variant="white" onClick={retake} disabled={sending}>
              다시 촬영
            </Button>
          </>
        }
      >
        <AppHeader title="촬영 확인" onBack={retake} />
        <div className={styles.content}>
          <h2 className={styles.title}>글자가 잘 보이나요?</h2>
          <p className={styles.description}>가게명과 날짜, 금액을 확인해 주세요.</p>
          <img src={photo.url} alt="찍은 영수증" className={styles.preview} />
          <p className={styles.caption}>인증에는 방문 확인에 필요한 정보만 사용해요.</p>
        </div>
      </Screen>
    );
  }

  // 카메라 권한 안내 (피그마 314:4299)
  if (cam === 'ask') {
    return (
      <Screen
        footer={
          <>
            <Button onClick={() => void startCamera()}>카메라 허용하기</Button>
            <AlbumButton onPick={pick} label="앨범에서 사진 고르기" />
          </>
        }
      >
        <AppHeader title="영수증 인증" />
        <div className={flow.content}>
          <div className={flow.center}>
            <span className={flow.ask} aria-hidden="true">
              <CameraIcon />
            </span>
            <h2 className={flow.title}>카메라를 켜도 될까요?</h2>
            <p className={flow.subtitle}>
              {'영수증을 찍으려면 카메라 권한이 필요해요.\n찍은 사진은 방문 인증에만 사용해요.'}
            </p>
          </div>
          <ul className={flow.checklist} data-check="true">
            <li>가게명·날짜·금액만 확인해요</li>
            <li>사진은 방문 인증에만 사용해요</li>
            <li>권한은 브라우저 설정에서 언제든 바꿀 수 있어요</li>
          </ul>
        </div>
      </Screen>
    );
  }

  // 카메라 권한 꺼짐 (피그마 314:4328)
  if (cam === 'blocked') {
    return (
      <Screen
        footer={
          <>
            <Button onClick={retry}>다시 시도하기</Button>
            <AlbumButton onPick={pick} label="앨범에서 사진 고르기" />
          </>
        }
      >
        <AppHeader title="영수증 인증" />
        <div className={flow.content}>
          <div className={flow.center}>
            <span className={flow.warn} aria-hidden="true">
              !
            </span>
            <h2 className={flow.title}>카메라 권한이 꺼져 있어요</h2>
            <p className={flow.subtitle}>
              {'브라우저에서 카메라가 차단됐어요.\n아래 순서로 허용한 뒤 다시 시도해 주세요.'}
            </p>
          </div>
          <ol className={flow.checklist}>
            <li>1. 주소창 왼쪽의 자물쇠 아이콘 누르기</li>
            <li>2. 카메라를 ‘허용’으로 바꾸기</li>
            <li>3. 이 화면으로 돌아와 다시 시도하기</li>
          </ol>
        </div>
      </Screen>
    );
  }

  const live = cam === 'live';
  return (
    <Screen
      footer={
        <div className={styles.captureButtons}>
          <label className={styles.fileButton} data-variant="white">
            앨범
            <input type="file" accept={RECEIPT_ACCEPT} onChange={(e) => pick(e.target.files)} />
          </label>
          {cam === 'none' ? (
            <label className={styles.fileButton}>
              촬영
              <input
                type="file"
                accept={RECEIPT_ACCEPT}
                capture="environment"
                onChange={(e) => pick(e.target.files)}
              />
            </label>
          ) : (
            <Button onClick={shoot} disabled={!live}>
              {live ? '촬영' : '카메라를 켜는 중…'}
            </Button>
          )}
        </div>
      }
    >
      <AppHeader title="영수증 인증" />
      <div className={styles.content}>
        <h2 className={styles.title}>영수증을 네모 안에 맞춰주세요</h2>
        <p className={styles.description}>
          {'가게명·방문 날짜·결제 금액이\n선명하게 보이도록 찍어주세요'}
        </p>
        {cam === 'none' ? (
          <div className={styles.frame} aria-hidden="true">
            <img src={receiptIcon} alt="" />
            <span>빛 반사 없이 영수증 전체를 담아주세요</span>
          </div>
        ) : (
          <div className={styles.frame} data-live="true">
            <video
              ref={video}
              className={styles.video}
              autoPlay
              muted
              playsInline
              aria-label="카메라 화면"
            />
            <span className={styles.frameHint}>빛 반사 없이 영수증 전체를 담아주세요</span>
          </div>
        )}
        <p className={styles.caption}>결제한 지 7일 안의 영수증만 인증할 수 있어요.</p>
      </div>
    </Screen>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}
