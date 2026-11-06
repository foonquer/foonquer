import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from '../config/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let sesClient: SESv2Client | null = null;

function ses() {
  // EC2에서는 인스턴스 IAM 역할로 자격 증명을 얻는다 (Access Key를 넣지 않는다).
  sesClient ??= new SESv2Client({ region: env.AWS_REGION });
  return sesClient;
}

/**
 * 메일을 보낸다. 실패하면 에러를 그대로 던지므로 부르는 쪽에서 EMAIL_SEND_FAILED 등으로 바꾼다.
 * MAIL_DRIVER=console(개발 기본값)이면 실제로 보내지 않고 서버 로그에 내용을 찍는다.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.MAIL_DRIVER === 'console') {
    console.info(`[mail:console] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }

  await ses().send(
    new SendEmailCommand({
      FromEmailAddress: env.MAIL_FROM,
      Destination: { ToAddresses: [mail.to] },
      Content: {
        Simple: {
          Subject: { Data: mail.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: mail.text, Charset: 'UTF-8' },
            Html: { Data: mail.html, Charset: 'UTF-8' },
          },
        },
      },
    }),
  );
}
