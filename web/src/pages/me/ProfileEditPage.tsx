import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AGE_LABEL,
  checkNickname,
  GENDER_LABEL,
  getMe,
  NICKNAME_MAX,
  NICKNAME_PATTERN,
  updateProfile,
  type AgeGroup,
  type Gender,
  type MyProfile,
} from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { MukkaebiAvatar } from '../../components/Mukkaebi';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { TextField, type FieldStatus } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import styles from './ProfileEditPage.module.css';

const GENDERS = (['F', 'M', 'N'] as const).map((value) => ({ value, label: GENDER_LABEL[value] }));
// 프로필 수정은 한 줄에 5칸이라 "50대+"로 줄여 쓴다 (Figma)
const AGES = ([10, 20, 30, 40, 50] as const).map((value) => ({
  value,
  label: value === 50 ? '50대+' : AGE_LABEL[value],
}));

/** 닉네임을 쓰다 멈추면 이만큼 뒤에 중복 확인 (ms) */
const CHECK_DELAY_MS = 400;

/** 프로필 수정 /me/profile (USER-04 → USER-05) */
export function ProfileEditPage() {
  const me = useAsync(getMe, []);
  if (me.error) {
    return (
      <Screen>
        <AppHeader title="프로필 수정" />
        <EmptyState title={errorMessage(me.error)} onRetry={me.reload} />
      </Screen>
    );
  }
  if (!me.data) {
    return (
      <Screen>
        <AppHeader title="프로필 수정" />
        <Loading />
      </Screen>
    );
  }
  return <ProfileForm me={me.data} />;
}

type Check = { nickname: string; status: FieldStatus; message: string };

function ProfileForm({ me }: { me: MyProfile }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [nickname, setNickname] = useState(me.nickname ?? '');
  const [gender, setGender] = useState<Gender | null>(me.gender);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(me.ageGroup);
  const [check, setCheck] = useState<Check | null>(null);
  const [saving, setSaving] = useState(false);

  const value = nickname.trim();
  const nicknameChanged = value !== me.nickname;
  // 30일 제한: 다시 바꿀 수 있는 날이 남아 있으면 닉네임은 고칠 수 없다
  const nicknameLocked = me.nicknameChangeableAt !== null;

  useEffect(() => {
    if (!nicknameChanged || !value) return;
    // 지난 입력의 응답이 늦게 와도 지금 화면에 쓰지 않는다
    let alive = true;
    const timer = setTimeout(() => {
      if (value.length < 2 || value.length > NICKNAME_MAX) {
        setCheck({ nickname: value, status: 'error', message: '닉네임은 2~10자로 입력해 주세요.' });
        return;
      }
      if (!NICKNAME_PATTERN.test(value)) {
        setCheck({
          nickname: value,
          status: 'error',
          message: '닉네임은 한글·영문·숫자만 쓸 수 있어요.',
        });
        return;
      }
      checkNickname(value).then(
        ({ data, message }) =>
          alive &&
          setCheck({
            nickname: value,
            status: data.available ? 'ok' : 'error',
            message: message.replace(/\.$/, ''),
          }),
        (err: unknown) =>
          alive && setCheck({ nickname: value, status: 'error', message: errorMessage(err) }),
      );
    }, CHECK_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value, nicknameChanged]);

  const current = nicknameChanged && check?.nickname === value ? check : null;
  const changes = {
    ...(nicknameChanged ? { nickname: value } : {}),
    ...(gender && gender !== me.gender ? { gender } : {}),
    ...(ageGroup && ageGroup !== me.ageGroup ? { ageGroup } : {}),
  };
  const dirty = Object.keys(changes).length > 0;
  const canSave = dirty && (!nicknameChanged || current?.status === 'ok') && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { message } = await updateProfile(changes);
      toast(message.replace(/\.$/, ''));
      navigate('/me', { replace: true });
    } catch (err) {
      if (
        err instanceof ApiError &&
        ['NICKNAME_DUPLICATE', 'NICKNAME_CHANGE_TOO_SOON', 'INVALID_NICKNAME'].includes(err.code)
      ) {
        setCheck({ nickname: value, status: 'error', message: err.message.replace(/\.$/, '') });
      } else {
        toast(errorMessage(err));
      }
      setSaving(false);
    }
  };

  const regions = me.localRegions;
  const regionText = regions[0]
    ? `${regions[0].sigunguName} ${regions[0].dongName}${regions.length > 1 ? ` 외 ${regions.length - 1}곳` : ''}`
    : '내 동네를 골라 주세요';

  return (
    <Screen
      footer={
        <Button onClick={save} disabled={!canSave}>
          저장하기
        </Button>
      }
    >
      <AppHeader
        title="프로필 수정"
        right={
          <button type="button" className={styles.saveText} onClick={save} disabled={!canSave}>
            저장
          </button>
        }
      />
      <div className={styles.content}>
        <div className={styles.avatar}>
          <MukkaebiAvatar size={88} />
          <Link to="/me/mukkaebi" className={styles.avatarChange}>
            변경
          </Link>
        </div>

        <TextField
          label="닉네임"
          value={nickname}
          onChange={setNickname}
          maxLength={NICKNAME_MAX}
          readOnly={nicknameLocked}
          right={
            <span className={styles.counter}>
              {value.length}/{NICKNAME_MAX}
            </span>
          }
          status={current?.status ?? 'default'}
          message={
            current?.message ??
            (nicknameLocked
              ? `닉네임은 ${formatDate(me.nicknameChangeableAt)}부터 바꿀 수 있어요`
              : '닉네임은 30일에 한 번 바꿀 수 있어요')
          }
          messageStatus={current ? undefined : 'default'}
        />

        <ChoiceGroup
          label="성별"
          options={GENDERS}
          value={gender}
          onChange={setGender}
          columns={3}
          size="sm"
          height={46}
        />
        <ChoiceGroup
          label="나이대"
          options={AGES}
          value={ageGroup}
          onChange={setAgeGroup}
          columns={5}
          size="sm"
          height={44}
        />

        <div className={styles.field}>
          <p className={styles.fieldLabel}>내 동네</p>
          <Link to="/me/regions" className={styles.regionRow}>
            <span>{regionText}</span>
            <span className={styles.regionChange}>변경</span>
          </Link>
          <p className={styles.info}>
            {'내 동네는 최대 3곳까지 고를 수 있고,\n고른 동네에서 쓴 리뷰에는 ‘로컬’이 표시돼요'}
          </p>
        </div>
      </div>
    </Screen>
  );
}
