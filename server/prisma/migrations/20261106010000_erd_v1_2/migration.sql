-- ERD v1.2 (2026-11-05 API 명세서 전체 점검)
-- 탐방러 프로필 소개글·대표 칭호, 저장 메모·알림 여부, 내 PICK, 축하 화면 확인 시각

-- AlterTable
ALTER TABLE `member`
    ADD COLUMN `bio` VARCHAR(60) NULL AFTER `profile_image_key`,
    ADD COLUMN `rep_title_type` CHAR(1) NULL AFTER `bio`,
    ADD COLUMN `rep_title_ref` BIGINT NULL AFTER `rep_title_type`;

ALTER TABLE `member` ADD CONSTRAINT `member_rep_title_chk`
    CHECK ((rep_title_type IS NULL AND rep_title_ref IS NULL)
        OR (rep_title_type IN ('A', 'T') AND rep_title_ref IS NOT NULL));

-- AlterTable
ALTER TABLE `saved_restaurant`
    ADD COLUMN `memo` VARCHAR(50) NULL AFTER `reminded_at`,
    ADD COLUMN `remind` BOOLEAN NOT NULL DEFAULT true AFTER `memo`;

-- AlterTable
ALTER TABLE `member_region_background` ADD COLUMN `seen_at` DATETIME(3) NULL AFTER `unlocked_at`;

-- AlterTable
ALTER TABLE `member_achievement` ADD COLUMN `seen_at` DATETIME(3) NULL AFTER `achieved_at`;

-- CreateTable
CREATE TABLE `member_pick` (
    `user_id` BIGINT NOT NULL,
    `restaurant_id` BIGINT NOT NULL,
    `sort_order` TINYINT NOT NULL,
    `comment` VARCHAR(30) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `member_pick_order_uk`(`user_id`, `sort_order`),
    INDEX `member_pick_restaurant_idx`(`restaurant_id`),
    PRIMARY KEY (`user_id`, `restaurant_id`),
    CONSTRAINT `member_pick_order_chk` CHECK (sort_order BETWEEN 0 AND 9)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `member_pick` ADD CONSTRAINT `member_pick_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_pick` ADD CONSTRAINT `member_pick_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
