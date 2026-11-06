import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

// 가입하지 않은 이메일로 로그인할 때도 bcrypt 비교 시간을 똑같이 써서, 응답 시간으로 가입 여부를 알 수 없게 한다.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-0', BCRYPT_ROUNDS);

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifySecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 비교할 해시가 없을 때 시간만 쓰고 false */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  await bcrypt.compare(plain, DUMMY_HASH);
  return false;
}
