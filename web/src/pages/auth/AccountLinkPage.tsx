import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { linkSocialAccount, type AccountLinkRequired } from '../../api/auth';
import { LOGIN_METHOD_LABEL, type LoginMethod } from '../../api/users';
import mailIcon from '../../assets/icons/mail.svg';
import { ResultScreen } from '../../components/ResultScreen';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { signIn } from '../../lib/session';

const PROVIDER_LABEL = { K: '카카오', G: '구글' } as const;

/** S-03-8 계정 연동 확인. 같은 이메일로 가입한 계정에 이 소셜 로그인을 붙일지 묻는다 (AUTH-09) */
export function AccountLinkPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const link = location.state as AccountLinkRequired | null;
  const [busy, setBusy] = useState(false);

  // 소셜 로그인 콜백을 거치지 않고 들어왔다
  if (!link?.accountLinkToken) return <Navigate to="/login" replace />;

  const provider = PROVIDER_LABEL[link.provider];
  const existing = link.existingLoginMethods
    .map((m) => LOGIN_METHOD_LABEL[m as LoginMethod] ?? m)
    .join('·');

  const connect = async () => {
    setBusy(true);
    try {
      const result = await linkSocialAccount(link.accountLinkToken);
      toast(`${provider} 계정을 연결했어요`);
      signIn(result.accessToken, result.nextAction); // 다음 화면은 라우트 가드가 정한다
    } catch (err) {
      // 5분이 지났거나 이미 쓴 연동 요청이면 처음부터 다시
      navigate('/login', { replace: true, state: { notice: errorMessage(err) } });
    }
  };

  return (
    <ResultScreen
      icon={mailIcon}
      title="이미 가입한 계정이 있어요"
      description={`${link.maskedEmail}으로 가입한 계정이 있어요.\n${provider} 로그인을 이 계정에 연결할까요?`}
      info={{
        title: '연결하면',
        bullets: [
          '정복 기록·먹깨비·먹포인트가 그대로 이어져요',
          `다음부터 ${existing}과 ${provider} 모두로 로그인할 수 있어요`,
        ],
      }}
      secondary={{
        label: '연결하지 않을래요',
        onClick: () => navigate('/login', { replace: true }),
      }}
      primary={{ label: `${provider} 계정 연결하기`, onClick: connect, disabled: busy }}
      onBack={() => navigate('/login', { replace: true })}
    />
  );
}
