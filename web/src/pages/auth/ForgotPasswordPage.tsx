import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { sendPasswordResetMail } from '../../api/auth';
import mailIcon from '../../assets/icons/mail.svg';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { PageTitle } from '../../components/PageTitle';
import { ResultScreen } from '../../components/ResultScreen';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useCountdown } from '../../lib/useCountdown';
import { isEmail } from '../../lib/validation';
import styles from './AuthForm.module.css';

/** S-03-3 비밀번호 찾기 → S-03-4 재설정 메일 발송 (AUTH-12) */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = useCountdown();

  const normalized = email.trim().toLowerCase();

  const send = async (to: string) => {
    setBusy(true);
    try {
      const result = await sendPasswordResetMail(to);
      setSentTo(result.email);
      resend.start(result.resendAvailableIn);
      return true;
    } catch (err) {
      if (sentTo) toast(errorMessage(err));
      else setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(normalized)) {
      setError('이메일 형식이 올바르지 않아요.');
      return;
    }
    await send(normalized);
  };

  if (sentTo) {
    return (
      <ResultScreen
        icon={mailIcon}
        title="메일을 보냈어요"
        description={`${sentTo}으로 보낸 링크를\n30분 안에 눌러 새 비밀번호를 정해 주세요`}
        info={{
          title: '메일이 안 왔다면',
          bullets: [
            '스팸함이나 프로모션함을 확인해 주세요',
            '가입할 때 쓴 이메일이 맞는지 확인해 주세요',
          ],
        }}
        secondary={{
          label: resend.running
            ? `메일 다시 보내기 (${resend.remaining}초 후)`
            : '메일 다시 보내기',
          onClick: () => void send(sentTo).then((ok) => ok && toast('메일을 다시 보냈어요')),
          disabled: resend.running || busy,
        }}
        primary={{
          label: '로그인으로 돌아가기',
          onClick: () => navigate('/login/email', { replace: true }),
        }}
        onBack={() => setSentTo(null)}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <Screen
        footer={
          <Button type="submit" disabled={!normalized || busy}>
            재설정 메일 보내기
          </Button>
        }
      >
        <AppHeader title="비밀번호 찾기" />
        <PageTitle
          title="가입한 이메일을 알려 주세요"
          description="비밀번호를 다시 정할 수 있는 링크를 보내 드릴게요"
        />
        <div className={styles.form} data-top="22">
          <TextField
            label="이메일"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setError('');
            }}
            status={error ? 'error' : 'default'}
            message={error || undefined}
          />
          <p className={styles.noteInline}>
            카카오·구글로 가입했다면 비밀번호 없이 해당 버튼으로 로그인해 주세요
          </p>
        </div>
      </Screen>
    </form>
  );
}
