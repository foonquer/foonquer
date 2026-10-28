import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { exchangeOAuthCode } from '../../api/auth';
import { PATH_OF } from '../../components/RouteGuards';
import { SplashScreen } from '../../components/SplashScreen';
import { errorMessage } from '../../lib/api';
import { signIn, signOut } from '../../lib/session';

/** 서버 콜백(AUTH-07)이 ?error=로 보낸 이유별 안내 */
const ERROR_MESSAGES: Record<string, string> = {
  OAUTH_CANCELLED: '로그인을 취소했어요.',
  OAUTH_STATE_MISMATCH: '로그인 요청이 올바르지 않아요. 다시 시도해 주세요.',
  UNSUPPORTED_PROVIDER: '지원하지 않는 로그인 방식이에요.',
  SOCIAL_LOGIN_FAILED: '소셜 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * /oauth/callback?code= (또는 ?error=)
 * 서버가 준 일회용 코드를 로그인 결과로 바꾼다 (AUTH-08). 같은 이메일 계정이 있으면 연동 확인 화면으로.
 */
export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    // 코드는 한 번만 쓸 수 있어서, 개발 모드(StrictMode)에서 effect가 두 번 돌아도 한 번만 보낸다.
    if (started.current) return;
    started.current = true;

    const fail = (notice: string) => {
      signOut();
      navigate('/login', { replace: true, state: { notice } });
    };

    const code = params.get('code');
    const error = params.get('error');
    if (!code) {
      fail(
        error && Object.hasOwn(ERROR_MESSAGES, error)
          ? ERROR_MESSAGES[error]
          : ERROR_MESSAGES.SOCIAL_LOGIN_FAILED,
      );
      return;
    }

    exchangeOAuthCode(code).then(
      (result) => {
        if (result.nextAction === 'ACCOUNT_LINK_REQUIRED') {
          signOut(); // 아직 로그인하지 않았다 (토큰 없음)
          navigate('/oauth/link', { replace: true, state: result });
          return;
        }
        signIn(result.accessToken, result.nextAction);
        navigate(PATH_OF[result.nextAction], { replace: true });
      },
      (err: unknown) => fail(errorMessage(err)),
    );
  }, [navigate, params]);

  return <SplashScreen />;
}
