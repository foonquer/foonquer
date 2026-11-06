-- 3차 멘토링 보고서·신뢰도 가중 별점 계산식 반영 (2026-11-05, ERD v1.0) 중 회원가입·음식점 쪽
-- 좋아하는 음식(S-05-1), 마패, 가게 별점 R(display_score)과 계산식 계수 표

-- 1. 좋아하는 음식 종류
CREATE TABLE `member_preferred_category` (
    `user_id` BIGINT NOT NULL,
    `category_id` INTEGER NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_preferred_category_category_idx`(`category_id`),
    PRIMARY KEY (`user_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `member_preferred_category` ADD CONSTRAINT `member_preferred_category_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `member_preferred_category` ADD CONSTRAINT `member_preferred_category_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. 마패
ALTER TABLE `restaurant` ADD COLUMN `has_mapae` BOOLEAN NOT NULL DEFAULT false AFTER `business_hours`;

CREATE TABLE `restaurant_mapae` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `restaurant_id` BIGINT NOT NULL,
    `reason` CHAR(1) NOT NULL,
    `evidence` VARCHAR(500) NULL,
    `report_id` BIGINT NULL,
    `review_id` BIGINT NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `granted_by` VARCHAR(50) NOT NULL,
    `granted_at` DATETIME(3) NOT NULL,
    `released_at` DATETIME(3) NULL,
    `release_reason` VARCHAR(255) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `restaurant_mapae_restaurant_idx`(`restaurant_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_mapae` ADD CONSTRAINT `restaurant_mapae_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `restaurant_mapae` ADD CONSTRAINT `restaurant_mapae_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `report`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `restaurant_mapae` ADD CONSTRAINT `restaurant_mapae_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `restaurant_mapae` ADD CONSTRAINT `restaurant_mapae_reason_chk` CHECK (reason in ('A','E'));
ALTER TABLE `restaurant_mapae` ADD CONSTRAINT `restaurant_mapae_status_chk` CHECK (status in ('A','R'));

-- 3. 가게 별점 R = (C × m + Σ(w × r)) / (C + Σw). w에 시간 감쇠가 곱해지고 최대 2.2라 소수 셋째 자리까지 둔다
ALTER TABLE `restaurant_stat`
    MODIFY `weight_sum` DECIMAL(10, 3) NOT NULL DEFAULT 0,
    MODIFY `weighted_score_sum` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `display_score` DECIMAL(2, 1) NULL AFTER `weighted_score_sum`,
    ADD COLUMN `display_score_at` DATETIME(3) NULL AFTER `display_score`;

-- 4. 계산식 계수 (값은 prisma/seed-data.ts가 넣는다)
CREATE TABLE `rating_param` (
    `code` VARCHAR(30) NOT NULL,
    `value` DECIMAL(8, 4) NOT NULL,
    `description` VARCHAR(100) NULL,
    `update_date` DATETIME(3) NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
