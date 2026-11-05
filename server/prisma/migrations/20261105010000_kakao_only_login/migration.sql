-- 로그인은 카카오 하나만 쓴다 (2026-11-05, ERD v0.9)
-- 이메일 회원가입·로그인, 구글 로그인, 비밀번호 찾기·변경, 같은 이메일 계정 연동을 없앤다.

-- 1. 카카오 회원번호를 member로 옮긴다
ALTER TABLE `member` ADD COLUMN `kakao_id` VARCHAR(20) NULL AFTER `id`;
CREATE UNIQUE INDEX `member_kakao_id_key` ON `member`(`kakao_id`);

-- 이미 카카오로 가입한 회원은 social_account의 카카오 id를 그대로 가져온다 (탈퇴 회원 제외)
UPDATE `member` m
JOIN `social_account` s ON s.`user_id` = m.`id` AND s.`provider` = 'K'
SET m.`kakao_id` = s.`provider_id`
WHERE m.`status` <> 'D';

-- 2. 소셜 계정 표는 쓰지 않는다
DROP TABLE `social_account`;

-- 3. 이메일·비밀번호·로그인 잠금 컬럼을 지운다
ALTER TABLE `member` DROP CHECK `member_login_fail_chk`;
DROP INDEX `member_email_key` ON `member`;
ALTER TABLE `member`
    DROP COLUMN `email`,
    DROP COLUMN `password`,
    DROP COLUMN `login_fail_count`,
    DROP COLUMN `locked_until`;

-- 4. 이메일 인증·비밀번호 재설정·계정 연동 토큰은 더 이상 만들지 않는다
DELETE FROM `auth_temporary_token` WHERE `token_type` <> 'OAUTH_RESULT';
