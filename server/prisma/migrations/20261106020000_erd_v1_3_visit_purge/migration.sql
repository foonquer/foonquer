-- ERD v1.3 (2026-11-06 팀 결정: 탈퇴하면 방문 기록의 개인정보를 바로 지운다, 보관하지 않음)
-- 탈퇴로 영수증·현장 사진 key, 좌표, OCR·결제 정보를 지운 방문은 purged_at을 채우고, 인증 방식별 필수 CHECK에서 뺀다

-- AlterTable
ALTER TABLE `visit` ADD COLUMN `purged_at` DATETIME(3) NULL AFTER `verified_at`;

ALTER TABLE `visit` DROP CHECK `visit_receipt_image_chk`;
ALTER TABLE `visit` DROP CHECK `visit_checkin_chk`;
ALTER TABLE `visit` DROP CHECK `visit_site_photo_chk`;
ALTER TABLE `visit` ADD CONSTRAINT `visit_receipt_image_chk`
    CHECK (method <> 'R' or receipt_image_key is not null or purged_at is not null);
ALTER TABLE `visit` ADD CONSTRAINT `visit_checkin_chk`
    CHECK (method <> 'S' or (checkin_lat is not null and checkin_lng is not null) or purged_at is not null);
ALTER TABLE `visit` ADD CONSTRAINT `visit_site_photo_chk`
    CHECK (method <> 'S' or status not in ('V','C') or site_photo_key is not null or purged_at is not null);
