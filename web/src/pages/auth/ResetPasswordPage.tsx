import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { checkPasswordResetToken, resetPassword } from '../../api/auth';
import mailIcon from '../../assets/icons/mail.svg';
import successIcon from '../../assets/icons/result-success.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { canSubmitNewPassword, NewPasswordFields } from '../../components/NewPasswordFields';
import { PageTitle } from '../../components/PageTitle';
import { ResultScreen } from '../../components/ResultScreen';
import { Screen } from '../../components/Screen';
import { Loading } from '../../components/StateViews';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { getSession, signOut } from '../../lib/session';
import { useAsync } from '../../lib/useAsync';
import styles from './AuthForm.module.css';

/** 링크가 잘못됐거나 만료됐을 때 오는 에러 */
const LINK_ERRORS = new Set([
  'PASSWORD_RESET_TOKEN_REQUIRED',
  'PASSWORD_RESET_TOKEN_INVALID',
  'PASSWORD_RESET_TOKEN_EXPIRED',
]);

const isLinkError = (err: unknown) => err instanceof ApiError && LINK_ERRORS.has(err.code);

/** 메일 링크 /password/reset?token= : S-03-5 새 비밀번호 → S-03-6 완료, 링크 문제면 S-03-9 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const link = useAsync(() => checkPasswordResetToken(token), [token]); // AUTH-13
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);

  const toLogin = () => {
    // 다른 기기·이 기기 모두 로그아웃된다 (서버가 refreshToken을 모두 폐기)
    if (getSession().status === 'authed') signOut();
    navigate('/login/email', { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmitNewPassword(password, confirm) || busy) return;
    setBusy(true);
    setServerError('');
    try {
      await resetPassword(token, password, confirm); // AUTH-14
      setDone(true);
    } catch (err) {
      if (isLinkError(err)) setExpired(true);
      else if (err instanceof ApiError && err.code === 'SAME_AS_CURRENT_PASSWORD') {
        setServerError(err.message);
      } else toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ResultScreen
        icon={successIcon}
        title="비밀번호를 바꿨어요"
        description={'새 비밀번호로 다시 로그인해 주세요.\n다른 기기에서는 자동으로 로그아웃돼요.'}
        info={{
          title: '계정을 안전하게 지키려면',
          bullets: [
            '다른 서비스와 같은 비밀번호는 피해 주세요',
            '잊어버려도 로그인 화면에서 다시 재설정할 수 있어요',
          ],
        }}
        primary={{ label: '새 비밀번호로 로그인하기', onClick: toLogin }}
      />
    );
  }

  if (expired || isLinkError(link.error) || !token) {
    return (
      <ResultScreen
        icon={mailIcon}
        title="링크가 만료되었어요"
        description={
          '비밀번호 재설정 링크는 30분 동안 한 번만 쓸 수 있어요.\n메일을 다시 받아 새 링크로 바꿔 주세요.'
        }
        info={{
          title: '이럴 때 만료돼요',
          bullets: [
            '메일을 받은 지 30분이 지났을 때',
            '이미 비밀번호를 바꾼 링크를 다시 열었을 때',
          ],
        }}
        secondary={{ label: '로그인으로 돌아가기', onClick: toLogin }}
        primary={{
          label: '재설정 메일 다시 받기',
          onClick: () => navigate('/password/forgot', { replace: true }),
        }}
      />
    );
  }

  if (link.loading) return <Loading />;

  return (
    <form onSubmit={submit} noValidate>
      <Screen
        footer={
          <Button type="submit" disabled={!canSubmitNewPassword(password, confirm) || busy}>
            비밀번호 바꾸기
          </Button>
        }
      >
        <AppHeader title="새 비밀번호" onBack={toLogin} />
        <PageTitle
          title="새 비밀번호를 정해 주세요"
          description="이전에 쓰던 비밀번호와 다르게 정해 주세요"
          compact
        />
        <div className={styles.form} data-top="22">
          <NewPasswordFields
            password={password}
            confirm={confirm}
            onPasswordChange={(v) => {
              setPassword(v);
              setServerError('');
            }}
            onConfirmChange={setConfirm}
            serverError={serverError}
          />
        </div>
      </Screen>
    </form>
  );
}
