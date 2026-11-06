import type { Mail } from '../../lib/mailer';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#222">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="font-size:12px;color:#888;margin-top:32px">본인이 요청하지 않았다면 이 메일은 무시해 주세요.<br>먹장깨기 — 우리 동네 맛집 정복 앱</p>
</div></body></html>`;
}

/** AUTH-02 이메일 인증 코드 */
export function verificationCodeMail(to: string, code: string): Mail {
  const title = '먹장깨기 이메일 인증 코드';
  return {
    to,
    subject: `[먹장깨기] 이메일 인증 코드 ${code}`,
    text: `${title}\n\n인증 코드: ${code}\n5분 안에 회원가입 화면에 입력해 주세요.\n\n본인이 요청하지 않았다면 이 메일은 무시해 주세요.`,
    html: layout(
      title,
      `<p>아래 6자리 코드를 5분 안에 회원가입 화면에 입력해 주세요.</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${escapeHtml(code)}</p>`,
    ),
  };
}

/** AUTH-12 비밀번호 재설정 링크 */
export function passwordResetMail(to: string, link: string): Mail {
  const title = '먹장깨기 비밀번호 재설정';
  return {
    to,
    subject: '[먹장깨기] 비밀번호 재설정 링크',
    text: `${title}\n\n아래 링크를 30분 안에 열어 새 비밀번호를 정해 주세요.\n${link}\n\n본인이 요청하지 않았다면 이 메일은 무시해 주세요.`,
    html: layout(
      title,
      `<p>아래 버튼을 30분 안에 눌러 새 비밀번호를 정해 주세요.</p>
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#ff6b4a;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">비밀번호 재설정하기</a></p>
<p style="font-size:12px;color:#888;word-break:break-all">버튼이 안 열리면 이 주소를 복사해 주세요: ${escapeHtml(link)}</p>`,
    ),
  };
}
