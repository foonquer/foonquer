-- 마패 제보·사장님 이의제기 (피그마 ⑥ 마패 신고, M5–M6, 2026-11-17)

-- 방문자 마패 제보: 가게에서 앱 카메라로 찍은 리뷰 이벤트 안내 사진 + 위치. 서로 다른 2명이면 마패 자동 표시
CREATE TABLE `mapae_report` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `restaurant_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `event_type` VARCHAR(10) NOT NULL,
    `memo` VARCHAR(200) NULL,
    `photo_key` VARCHAR(255) NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `distance_m` INTEGER NOT NULL,
    `has_visit` BOOLEAN NOT NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'P',
    `mapae_id` BIGINT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mapae_report_restaurant_idx`(`restaurant_id`, `status`, `reg_date`),
    INDEX `mapae_report_user_idx`(`user_id`, `reg_date`),
    PRIMARY KEY (`id`),
    CONSTRAINT `mapae_report_event_type_chk` CHECK (event_type IN ('STAR5', 'SERVICE', 'RECEIPT', 'ETC')),
    CONSTRAINT `mapae_report_status_chk` CHECK (status IN ('P', 'C', 'R'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `mapae_report` ADD CONSTRAINT `mapae_report_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `mapae_report` ADD CONSTRAINT `mapae_report_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `mapae_report` ADD CONSTRAINT `mapae_report_mapae_id_fkey` FOREIGN KEY (`mapae_id`) REFERENCES `restaurant_mapae`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 사장님 마패 이의제기는 1:1 문의(category MAPAE)로 받는다: 대상 가게·가게와의 관계·사유
ALTER TABLE `inquiry` ADD COLUMN `ref_restaurant_id` BIGINT NULL AFTER `image_key`,
    ADD COLUMN `owner_relation` VARCHAR(10) NULL AFTER `ref_restaurant_id`,
    ADD COLUMN `objection_reason` VARCHAR(10) NULL AFTER `owner_relation`;
ALTER TABLE `inquiry` ADD CONSTRAINT `inquiry_ref_restaurant_id_fkey` FOREIGN KEY (`ref_restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 마패가 확정되면 제보자에게 +50P (배포 seed도 같은 값을 넣는다)
INSERT IGNORE INTO `reward_policy` (`reason`, `point`, `exp`, `daily_limit`, `description`) VALUES ('MAPAE_REPORT', 50, 0, NULL, '마패 제보 확정');
