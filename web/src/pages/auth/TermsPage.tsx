import { useState } from 'react';
import { hasRequiredConsents, NO_CONSENTS, saveConsents, type Consents } from '../../api/auth';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { ConsentCard } from '../../components/ConsentCard';
import { PageTitle } from '../../components/PageTitle';
import { Screen } from '../../components/Screen';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { setNextAction } from '../../lib/session';
import styles from './AuthForm.module.css';

/** S-03-7 약관 동의 (카카오로 처음 가입한 회원, AUTH-15) */
export function TermsPage() {
  const toast = useToast();
  const [consents, setConsents] = useState<Consents>(NO_CONSENTS);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await saveConsents(consents);
      setNextAction(result.nextAction); // → 프로필 설정
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <Button onClick={submit} disabled={!hasRequiredConsents(consents) || busy}>
          동의하고 시작하기
        </Button>
      }
    >
      <AppHeader title="약관 동의" />
      <PageTitle
        title="약관에 동의해 주세요"
        description={`카카오로 가입했어요.\n먹장깨기를 쓰려면 아래 필수 약관에 동의해 주세요.`}
      />
      <div className={styles.consents}>
        <ConsentCard value={consents} onChange={setConsents} />
      </div>
    </Screen>
  );
}
