-- 모임 (피그마 12. 맞춤 퀘스트 · 모임, 2026-11-10)

-- 설정 "모임 퀘스트 · 초대 알림"
ALTER TABLE `member` ADD COLUMN `crew_alarm` BOOLEAN NOT NULL DEFAULT true AFTER `personalized_reco`;

CREATE TABLE `crew` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `type` CHAR(1) NOT NULL,
    `name` VARCHAR(12) NOT NULL,
    `sigungu_id` INTEGER NOT NULL,
    `invite_code` VARCHAR(10) NOT NULL,
    `owner_id` BIGINT NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `crew_invite_code_key`(`invite_code`),
    PRIMARY KEY (`id`),
    CONSTRAINT `crew_type_chk` CHECK (type IN ('F', 'A', 'C'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crew_member` (
    `crew_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `status` CHAR(1) NOT NULL,
    `invited_by` BIGINT NULL,
    `invited_at` DATETIME(3) NULL,
    `joined_at` DATETIME(3) NULL,

    INDEX `crew_member_user_idx`(`user_id`, `status`),
    PRIMARY KEY (`crew_id`, `user_id`),
    CONSTRAINT `crew_member_status_chk` CHECK (status IN ('I', 'A', 'R', 'L'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crew_conquest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `crew_id` BIGINT NOT NULL,
    `restaurant_id` BIGINT NOT NULL,
    `conquered_on` DATE NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `crew_conquest_uk`(`crew_id`, `restaurant_id`, `conquered_on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crew_conquest_member` (
    `crew_conquest_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `visit_id` BIGINT NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `crew_conquest_member_visit_idx`(`visit_id`),
    PRIMARY KEY (`crew_conquest_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crew_quest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `crew_id` BIGINT NOT NULL,
    `week_start` DATE NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `restaurant_id` BIGINT NULL,
    `target` TINYINT NOT NULL DEFAULT 1,
    `title` VARCHAR(60) NOT NULL,
    `summary` VARCHAR(100) NOT NULL,
    `reward_point` INTEGER NOT NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `completed_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `crew_quest_week_uk`(`crew_id`, `week_start`, `type`),
    PRIMARY KEY (`id`),
    CONSTRAINT `crew_quest_status_chk` CHECK (status IN ('A', 'C'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crew_quest_entry` (
    `crew_quest_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `restaurant_id` BIGINT NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `crew_quest_entry_restaurant_uk`(`crew_quest_id`, `restaurant_id`),
    PRIMARY KEY (`crew_quest_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crew_badge` (
    `crew_id` BIGINT NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`crew_id`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `crew` ADD CONSTRAINT `crew_sigungu_id_fkey` FOREIGN KEY (`sigungu_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew` ADD CONSTRAINT `crew_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_member` ADD CONSTRAINT `crew_member_crew_id_fkey` FOREIGN KEY (`crew_id`) REFERENCES `crew`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_member` ADD CONSTRAINT `crew_member_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_member` ADD CONSTRAINT `crew_member_invited_by_fkey` FOREIGN KEY (`invited_by`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `crew_conquest` ADD CONSTRAINT `crew_conquest_crew_id_fkey` FOREIGN KEY (`crew_id`) REFERENCES `crew`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_conquest` ADD CONSTRAINT `crew_conquest_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_conquest_member` ADD CONSTRAINT `crew_conquest_member_crew_conquest_id_fkey` FOREIGN KEY (`crew_conquest_id`) REFERENCES `crew_conquest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_conquest_member` ADD CONSTRAINT `crew_conquest_member_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_quest` ADD CONSTRAINT `crew_quest_crew_id_fkey` FOREIGN KEY (`crew_id`) REFERENCES `crew`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_quest` ADD CONSTRAINT `crew_quest_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `crew_quest_entry` ADD CONSTRAINT `crew_quest_entry_crew_quest_id_fkey` FOREIGN KEY (`crew_quest_id`) REFERENCES `crew_quest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_quest_entry` ADD CONSTRAINT `crew_quest_entry_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_quest_entry` ADD CONSTRAINT `crew_quest_entry_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `crew_badge` ADD CONSTRAINT `crew_badge_crew_id_fkey` FOREIGN KEY (`crew_id`) REFERENCES `crew`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
