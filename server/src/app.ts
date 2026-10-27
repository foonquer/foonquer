import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './common/middlewares/error-handler';
import { env } from './config/env';
import { router } from './routes';

export function createApp() {
  const app = express();

  // Prisma의 BigInt id를 JSON 숫자로 내보낸다 (JSON.stringify는 BigInt를 못 다룬다).
  app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? Number(value) : value,
  );
  // 프록시 뒤에서 req.ip가 실제 사용자 IP가 되게 한다 (요청 횟수 제한에 사용).
  app.set('trust proxy', env.TRUST_PROXY);

  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cors({ origin: origins.length > 0 ? origins : true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/v1', router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
