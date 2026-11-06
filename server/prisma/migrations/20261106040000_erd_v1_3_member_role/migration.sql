-- ERD v1.3 (2026-11-06): 관리자 API (/api/v1/admin) — 운영자 계정 표시
-- 운영자는 DB에서 직접 지정한다: UPDATE member SET role = 'A' WHERE id = ?;

-- AlterTable
ALTER TABLE `member` ADD COLUMN `role` CHAR(1) NOT NULL DEFAULT 'U' AFTER `status`;
ALTER TABLE `member` ADD CONSTRAINT `member_role_chk` CHECK (role in ('U','A'));
