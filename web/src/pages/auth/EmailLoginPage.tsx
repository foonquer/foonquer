import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { login } from '../../api/auth';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { PageTitle } from '../../components/PageTitle';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { ApiError, errorMessage } from '../../lib/api';
import { signIn } from '../../lib/session';
import styles from './AuthForm.module.css';

type LoginError = { message: string; hint?: string };

function toLoginError(err: unknown): LoginError {
  if (err instanceof ApiError && err.code === 'LOGIN_INVALID_CREDENTIALS') {
    const { failCount, maxFailCount } = (err.data ?? {}) as {
      failCount?: number | null;
      maxFailCount?: number;
    };
    // 가입하지 않은 이메일은 failCount가 null (가입 여부를 알려 주지 않는다)
    return failCount
      ? {
          message: `${err.message.replace(/\.$/, '')} (${failCount}/${maxFailCount ?? 5})`,
          hint: `${maxFailCount ?? 5}번 틀리면 10분 동안 로그인할 수 없어요`,
        }
      : { message: err.message.replace(/\.$/, '') };
  }
  return { message: errorMessage(err) };
}

/** S-03-1 이메일 로그인 */
export function EmailLoginPage() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<LoginError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      // 다음 화면(홈·원래 가려던 화면·약관·프로필)은 라우트 가드가 정한다
      signIn(result.accessToken, result.nextAction);
    } catch (err) {
      setError(toLoginError(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Screen
        footer={
          <Button type="submit" disabled={!email.trim() || !password || busy}>
            로그인
          </Button>
        }
      >
        <AppHeader title="로그인" />
        <PageTitle title="다시 만나서 반가워요" description="가입한 이메일로 로그인해 주세요" />
        <div className={styles.form} data-gap="18">
          <TextField
            label="이메일"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setError(null);
            }}
          />
          <TextField
            label="비밀번호"
            password
            autoComplete="current-password"
            placeholder="비밀번호"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
            status={error ? 'alert' : 'default'}
            message={error?.message}
            hint={error?.hint}
          />
        </div>
        <div className={styles.links}>
          <Link to="/password/forgot">비밀번호 찾기</Link>
          <span className={styles.bar} aria-hidden="true" />
          <Link to="/signup/email" state={location.state} className={styles.strong}>
            이메일로 회원가입
          </Link>
        </div>
      </Screen>
    </form>
  );
}
