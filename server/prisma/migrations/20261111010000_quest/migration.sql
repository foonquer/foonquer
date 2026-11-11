-- 맞춤 퀘스트 (피그마 12. 맞춤 퀘스트 · 모임, 2026-11-10)

-- 설정 "맞춤 퀘스트", "방문 기록으로 맞춤 추천"
ALTER TABLE `member` ADD COLUMN `quest_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `weight_price`,
  ADD COLUMN `personalized_reco` BOOLEAN NOT NULL DEFAULT true AFTER `quest_enabled`;

CREATE TABLE `quest_week` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `week_start` DATE NOT NULL,
    `base_count` TINYINT NOT NULL,
    `activity` CHAR(1) NOT NULL,
    `swapped_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `quest_week_user_week_uk`(`user_id`, `week_start`),
    PRIMARY KEY (`id`),
    CONSTRAINT `quest_week_activity_chk` CHECK (activity IN ('L', 'M', 'H')),
    CONSTRAINT `quest_week_base_count_chk` CHECK (base_count BETWEEN 0 AND 4)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `week_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `level` CHAR(1) NOT NULL,
    `restaurant_id` BIGINT NULL,
    `region_id` INTEGER NULL,
    `target` TINYINT NOT NULL DEFAULT 1,
    `progress` TINYINT NOT NULL DEFAULT 0,
    `title` VARCHAR(60) NOT NULL,
    `summary` VARCHAR(100) NOT NULL,
    `reasons` JSON NOT NULL,
    `reward_point` INTEGER NOT NULL,
    `is_bonus` BOOLEAN NOT NULL DEFAULT false,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `done_restaurant_id` BIGINT NULL,
    `completed_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `quest_user_status_idx`(`user_id`, `status`),
    INDEX `quest_user_restaurant_idx`(`user_id`, `restaurant_id`, `reg_date`),
    PRIMARY KEY (`id`),
    CONSTRAINT `quest_level_chk` CHECK (level IN ('E', 'X', 'C')),
    CONSTRAINT `quest_status_chk` CHECK (status IN ('A', 'C', 'S', 'D')),
    CONSTRAINT `quest_progress_chk` CHECK (target >= 1 AND progress BETWEEN 0 AND target)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quest_dislike` (
    `user_id` BIGINT NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `update_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`user_id`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `quest_week` ADD CONSTRAINT `quest_week_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `quest` ADD CONSTRAINT `quest_week_id_fkey` FOREIGN KEY (`week_id`) REFERENCES `quest_week`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `quest` ADD CONSTRAINT `quest_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `quest` ADD CONSTRAINT `quest_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quest` ADD CONSTRAINT `quest_done_restaurant_id_fkey` FOREIGN KEY (`done_restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quest` ADD CONSTRAINT `quest_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `quest_dislike` ADD CONSTRAINT `quest_dislike_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
