import { useEffect, useState } from 'react';
import { checkNickname, NICKNAME_MAX, NICKNAME_PATTERN } from '../../api/users';
import { Button } from '../../components/Button';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { Screen } from '../../components/Screen';
import { TextField, type FieldStatus } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { StepHeader } from './StepHeader';
import styles from './ProfileSetup.module.css';

/** 닉네임을 쓰다 멈추면 이만큼 뒤에 중복 확인 (ms) */
const CHECK_DELAY_MS = 400;

type Check = { nickname: string; status: FieldStatus; message: string };

/** 서버 확인 전에 규칙만 보고 알려 줄 문구 (null이면 규칙은 맞음) */
function ruleMessage(nickname: string) {
  if (nickname.length < 2 || nickname.length > NICKNAME_MAX)
    return '닉네임은 2~10자로 입력해 주세요.';
  if (!NICKNAME_PATTERN.test(nickname)) return '닉네임은 한글·영문·숫자만 쓸 수 있어요.';
  return null;
}

type Props = { nickname: string; onNext: (nickname: string) => void };

/** S-04 닉네임 (USER-01 중복 확인) */
export function NicknameStep({ nickname: initial, onNext }: Props) {
  const toast = useToast();
  const [nickname, setNickname] = useState(initial);
  const [check, setCheck] = useState<Check | null>(null);
  const value = nickname.trim();

  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => {
      const problem = ruleMessage(value);
      if (problem) {
        setCheck({ nickname: value, status: 'error', message: problem });
        return;
      }
      checkNickname(value).then(
        ({ data, message }) =>
          setCheck({
            nickname: value,
            status: data.available ? 'ok' : 'error',
            message:
              data.reason === 'DUPLICATE'
                ? '이미 누군가 쓰고 있어요. 다른 이름은 어때요?'
                : message.replace(/\.$/, ''),
          }),
        (err: unknown) =>
          setCheck({ nickname: value, status: 'error', message: errorMessage(err) }),
      );
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const current = check?.nickname === value ? check : null;
  const available = current?.status === 'ok';

  return (
    <Screen
      footer={
        <Button onClick={() => onNext(value)} disabled={!available}>
          다음
        </Button>
      }
    >
      <StepHeader
        step={1}
        name="닉네임"
        title="탐험가 이름을 정해 주세요"
        description="랭킹과 먹짱 지도에 이 이름으로 보여요"
      />
      <div className={styles.content}>
        <div className={styles.profileCard}>
          <MukkaebiAvatar size={64} />
          <div className={styles.profileText}>
            <p className={styles.profileTitle}>기본 캐릭터</p>
            <p className={styles.profileSub}>사진으로 바꿀 수 있어요</p>
          </div>
          {/* 프로필 사진 올리기(USER-02)는 업로드 방식이 정해지면 연결한다 */}
          <button
            type="button"
            className={styles.changeChip}
            onClick={() => toast('사진 올리기는 준비 중이에요. 지금은 기본 캐릭터로 시작해요.')}
          >
            변경
          </button>
        </div>
        <TextField
          label="닉네임"
          placeholder="2~10자로 입력해 주세요"
          value={nickname}
          onChange={setNickname}
          maxLength={NICKNAME_MAX}
          autoComplete="nickname"
          right={
            <span className={styles.counter}>
              {value.length}/{NICKNAME_MAX}
            </span>
          }
          status={current?.status ?? 'default'}
          message={current?.message ?? '한글·영문·숫자 사용 가능'}
          messageStatus={current ? undefined : 'default'}
        />
      </div>
    </Screen>
  );
}
