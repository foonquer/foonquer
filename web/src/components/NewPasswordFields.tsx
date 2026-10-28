import { useState } from 'react';
import {
  isValidPassword,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_RULE_MESSAGE,
} from '../lib/validation';
import { TextField } from './TextField';

type Props = {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  /** 서버가 새 비밀번호를 거절한 이유 (예: 이전 비밀번호와 같음) */
  serverError?: string;
};

/** 새 비밀번호 + 확인 입력 (비밀번호 재설정 S-03-5, 비밀번호 변경) */
export function NewPasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  serverError,
}: Props) {
  const [touched, setTouched] = useState(false);
  const valid = isValidPassword(password);
  const ruleError = touched && password && !valid ? PASSWORD_RULE_MESSAGE : '';
  const passwordError = serverError || ruleError;
  const matched = confirm.length > 0 && confirm === password;

  return (
    <>
      <TextField
        label="새 비밀번호"
        password
        autoComplete="new-password"
        placeholder="영문·숫자 포함 8자 이상"
        value={password}
        onChange={onPasswordChange}
        onBlur={() => setTouched(true)}
        status={passwordError ? 'error' : valid ? 'ok' : 'default'}
        message={passwordError || undefined}
      />
      <TextField
        label="새 비밀번호 확인"
        password
        autoComplete="new-password"
        placeholder="비밀번호를 한 번 더 입력"
        value={confirm}
        onChange={onConfirmChange}
        status={!confirm ? 'default' : matched ? (valid ? 'ok' : 'default') : 'error'}
        message={confirm && !matched ? PASSWORD_MISMATCH_MESSAGE : undefined}
      />
    </>
  );
}

/** 새 비밀번호를 보낼 수 있는지 */
// eslint-disable-next-line react-refresh/only-export-components
export function canSubmitNewPassword(password: string, confirm: string) {
  return isValidPassword(password) && password === confirm;
}
