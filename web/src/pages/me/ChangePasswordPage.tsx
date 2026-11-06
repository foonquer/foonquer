import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { changePassword } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { canSubmitNewPassword, NewPasswordFields } from '../../components/NewPasswordFields';
import { PageTitle } from '../../components/PageTitle';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { replaceAccessToken } from '../../lib/session';
import authStyles from '../auth/AuthForm.module.css';

const trim = (message: string) => message.replace(/\.$/, '');

/** 비밀번호 변경 /me/password (SET-05). 다른 기기는 로그아웃되고 이 기기는 새 토큰으로 이어진다 */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [currentError, setCurrentError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = current.length > 0 && canSubmitNewPassword(password, confirm) && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const { data, message } = await changePassword({
        currentPassword: current,
        newPassword: password,
        newPasswordConfirm: confirm,
      });
      replaceAccessToken(data.accessToken);
      toast(trim(message));
      navigate('/me/settings', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CURRENT_PASSWORD_INCORRECT') {
        setCurrentError(trim(err.message));
      } else if (err instanceof ApiError && err.code === 'SAME_AS_CURRENT_PASSWORD') {
        setServerError(trim(err.message));
      } else {
        toast(errorMessage(err));
      }
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Screen
        footer={
          <Button type="submit" disabled={!canSubmit}>
            비밀번호 바꾸기
          </Button>
        }
      >
        <AppHeader title="비밀번호 변경" />
        <PageTitle
          title="새 비밀번호를 정해 주세요"
          description="이전에 쓰던 비밀번호와 다르게 정해 주세요"
          compact
        />
        <div className={authStyles.form} data-top="22">
          <TextField
            label="지금 비밀번호"
            password
            autoComplete="current-password"
            placeholder="지금 쓰는 비밀번호"
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setCurrentError('');
            }}
            status={currentError ? 'error' : 'default'}
            message={currentError || undefined}
          />
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
