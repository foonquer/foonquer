import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  checkEmail,
  hasRequiredConsents,
  NO_CONSENTS,
  sendVerificationCode,
  signup,
  verifyCode,
  type Consents,
} from '../../api/auth';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ConsentCard } from '../../components/ConsentCard';
import { PageTitle } from '../../components/PageTitle';
import { Screen } from '../../components/Screen';
import { TextField, type FieldStatus } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { signIn } from '../../lib/session';
import { useCountdown } from '../../lib/useCountdown';
import {
  formatCountdown,
  isEmail,
  isValidPassword,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_RULE_MESSAGE,
} from '../../lib/validation';
import styles from './AuthForm.module.css';

/** 이메일을 다 쓰고 이만큼 멈추면 중복 확인을 한다 (ms) */
const CHECK_DELAY_MS = 500;
const CODE_LENGTH = 6;

type Check = { email: string; status: FieldStatus; message: string };

const trimPeriod = (message: string) => message.replace(/\.$/, '');

/** S-03-2 이메일 회원가입: 중복 확인 → 인증 코드 → 비밀번호 → 약관 */
export function EmailSignupPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [consents, setConsents] = useState<Consents>(NO_CONSENTS);
  const [submitting, setSubmitting] = useState(false);
  const expiry = useCountdown();
  const resend = useCountdown();
  const verifying = useRef(false);

  const normalized = email.trim().toLowerCase();

  // AUTH-01 이메일 중복 확인 (쓰다 멈추면)
  useEffect(() => {
    if (!normalized) return;
    // 지난 입력의 응답이 늦게 와도 지금 화면에 쓰지 않는다
    let alive = true;
    const timer = setTimeout(() => {
      if (!isEmail(normalized)) {
        setCheck({ email: normalized, status: 'error', message: '이메일 형식이 올바르지 않아요.' });
        return;
      }
      checkEmail(normalized).then(
        ({ data, message }) =>
          alive &&
          setCheck({
            email: normalized,
            status: data.available ? 'ok' : 'error',
            message: trimPeriod(message),
          }),
        (err: unknown) =>
          alive && setCheck({ email: normalized, status: 'error', message: errorMessage(err) }),
      );
    }, CHECK_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [normalized]);

  const emailCheck = check?.email === normalized ? check : null;
  const emailAvailable = emailCheck?.status === 'ok';

  const changeEmail = (value: string) => {
    setEmail(value);
    // 이메일을 바꾸면 인증을 처음부터
    setCodeSent(false);
    setCode('');
    setCodeError('');
    setVerifiedToken(null);
    expiry.stop();
    resend.stop();
  };

  // AUTH-02 인증 코드 보내기
  const sendCode = async () => {
    if (!emailAvailable || sending) return;
    setSending(true);
    try {
      const result = await sendVerificationCode(normalized);
      setCodeSent(true);
      setCode('');
      setCodeError('');
      expiry.start(result.expiresIn);
      resend.start(result.resendAvailableIn);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  // AUTH-03 6자리를 다 쓰면 바로 확인
  const changeCode = async (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setCodeError('');
    if (digits.length !== CODE_LENGTH || verifying.current) return;
    verifying.current = true;
    try {
      const result = await verifyCode(normalized, digits);
      setVerifiedToken(result.emailVerificationToken);
      expiry.stop();
    } catch (err) {
      setCodeError(errorMessage(err));
    } finally {
      verifying.current = false;
    }
  };

  const codeExpired = codeSent && !verifiedToken && expiry.started && !expiry.running;
  const passwordOk = isValidPassword(password);
  const confirmOk = confirm.length > 0 && confirm === password;
  const canSubmit =
    !!verifiedToken && passwordOk && confirmOk && hasRequiredConsents(consents) && !submitting;

  // AUTH-04 가입
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !verifiedToken) return;
    setSubmitting(true);
    try {
      const result = await signup({
        email: normalized,
        password,
        passwordConfirm: confirm,
        emailVerificationToken: verifiedToken,
        consents,
      });
      signIn(result.accessToken, result.nextAction); // → 프로필 설정
    } catch (err) {
      if (err instanceof ApiError && err.code.startsWith('EMAIL_VERIFICATION_TOKEN')) {
        // 인증한 지 30분이 지났다: 코드를 다시 받게 한다
        setVerifiedToken(null);
        setCodeSent(false);
        setCode('');
      }
      toast(errorMessage(err));
      setSubmitting(false);
    }
  };

  const emailMessage = codeSent ? (
    <>
      인증 코드를 보냈어요 ·
      <button
        type="button"
        className={styles.resend}
        onClick={sendCode}
        disabled={resend.running || sending}
      >
        코드 다시 보내기{resend.running ? ` (${resend.remaining}초 후)` : ''}
      </button>
    </>
  ) : (
    emailCheck?.message
  );

  return (
    <form onSubmit={submit} noValidate>
      <Screen
        footer={
          <Button type="submit" disabled={!canSubmit}>
            다음
          </Button>
        }
      >
        <AppHeader title="회원가입" />
        <PageTitle title="이메일로 가입할게요" />
        <div className={styles.form} data-top="14">
          <TextField
            label="이메일"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={changeEmail}
            status={codeSent ? 'default' : (emailCheck?.status ?? 'default')}
            message={emailMessage}
            messageStatus={codeSent ? 'ok' : undefined}
            right={
              emailAvailable && !codeSent ? (
                <button
                  type="button"
                  className={styles.inlineAction}
                  onClick={sendCode}
                  disabled={sending}
                >
                  인증 코드 받기
                </button>
              ) : undefined
            }
          />

          {codeSent && (
            <TextField
              label="인증 코드"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="숫자 6자리"
              value={code}
              onChange={changeCode}
              readOnly={!!verifiedToken}
              className={styles.code}
              status={codeError || codeExpired ? 'error' : 'default'}
              messageStatus={verifiedToken ? 'ok' : undefined}
              message={
                verifiedToken
                  ? '이메일 인증이 끝났어요'
                  : codeError ||
                    (codeExpired ? '인증 코드가 만료되었어요. 다시 받아 주세요.' : undefined)
              }
              right={
                !verifiedToken && expiry.running ? (
                  <span className={styles.timer}>{formatCountdown(expiry.remaining)}</span>
                ) : undefined
              }
            />
          )}

          <TextField
            label="비밀번호"
            password
            autoComplete="new-password"
            placeholder="영문·숫자 포함 8자 이상"
            value={password}
            onChange={setPassword}
            onBlur={() => setPasswordTouched(true)}
            status={passwordOk ? 'ok' : passwordTouched && password ? 'error' : 'default'}
            message={!passwordOk && passwordTouched && password ? PASSWORD_RULE_MESSAGE : undefined}
          />
          <TextField
            label="비밀번호 확인"
            password
            autoComplete="new-password"
            placeholder="비밀번호를 한 번 더 입력"
            value={confirm}
            onChange={setConfirm}
            status={!confirm ? 'default' : confirmOk ? (passwordOk ? 'ok' : 'default') : 'error'}
            message={confirm && !confirmOk ? PASSWORD_MISMATCH_MESSAGE : undefined}
          />
        </div>
        <div className={styles.consents}>
          <ConsentCard value={consents} onChange={setConsents} />
        </div>
      </Screen>
    </form>
  );
}
