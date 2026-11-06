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
import styles from './Visit.module.css';

type Photo = { file: File; url: string };

/**
 * 영수증 인증 /visits/new/receipt?restaurantId= (홈에서 바로 찍으면 /visits/new, 가게 없음)
 * 촬영(카메라 앱) 또는 앨범 → 촬영 확인 → 업로드 + VISIT-03 → 결과 화면(/visits/:id)에서 읽는 중·성공·실패
 */
export function ReceiptPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const id = Number(params.get('restaurantId'));
  const restaurantId = Number.isInteger(id) && id > 0 ? id : undefined;
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) setPhoto({ file, url: URL.createObjectURL(file) });
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
            <Button variant="white" onClick={() => setPhoto(null)} disabled={sending}>
              다시 촬영
            </Button>
          </>
        }
      >
        <AppHeader title="촬영 확인" onBack={() => setPhoto(null)} />
        <div className={styles.content}>
          <h2 className={styles.title}>글자가 잘 보이나요?</h2>
          <p className={styles.description}>가게명과 날짜, 금액을 확인해 주세요.</p>
          <img src={photo.url} alt="찍은 영수증" className={styles.preview} />
          <p className={styles.caption}>인증에는 방문 확인에 필요한 정보만 사용해요.</p>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <div className={styles.captureButtons}>
          <label className={styles.fileButton} data-variant="white">
            앨범
            <input type="file" accept={RECEIPT_ACCEPT} onChange={(e) => pick(e.target.files)} />
          </label>
          <label className={styles.fileButton}>
            촬영
            <input
              type="file"
              accept={RECEIPT_ACCEPT}
              capture="environment"
              onChange={(e) => pick(e.target.files)}
            />
          </label>
        </div>
      }
    >
      <AppHeader title="영수증 인증" />
      <div className={styles.content}>
        <h2 className={styles.title}>영수증을 네모 안에 맞춰주세요</h2>
        <p className={styles.description}>
          {'가게명·방문 날짜·결제 금액이\n선명하게 보이도록 찍어주세요'}
        </p>
        <div className={styles.frame} aria-hidden="true">
          <img src={receiptIcon} alt="" />
          <span>빛 반사 없이 영수증 전체를 담아주세요</span>
        </div>
        <p className={styles.caption}>결제한 지 7일 안의 영수증만 인증할 수 있어요.</p>
      </div>
    </Screen>
  );
}
