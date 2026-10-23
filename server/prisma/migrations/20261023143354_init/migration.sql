-- CreateTable
CREATE TABLE `member` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NULL,
    `password` VARCHAR(255) NULL,
    `nickname` VARCHAR(10) NULL,
    `nickname_changed_at` DATETIME(3) NULL,
    `gender` CHAR(1) NULL,
    `age_group` TINYINT NULL,
    `local_changed_at` DATETIME(3) NULL,
    `profile_image_key` VARCHAR(255) NULL,
    `trust_temp` DECIMAL(4, 1) NOT NULL DEFAULT 36.5,
    `point_balance` INTEGER NOT NULL DEFAULT 0,
    `conquest_alarm` BOOLEAN NOT NULL DEFAULT true,
    `rank_alarm` BOOLEAN NOT NULL DEFAULT true,
    `marketing_alarm` BOOLEAN NOT NULL DEFAULT false,
    `login_fail_count` TINYINT NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'P',
    `last_login_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_date` DATETIME(3) NULL,
    `delete_date` DATETIME(3) NULL,

    UNIQUE INDEX `member_email_key`(`email`),
    UNIQUE INDEX `member_nickname_key`(`nickname`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_local_region` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `region_id` INTEGER NOT NULL,
    `sigungu_id` INTEGER NOT NULL,
    `sort_order` TINYINT NOT NULL DEFAULT 0,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_local_region_sigungu_idx`(`sigungu_id`),
    UNIQUE INDEX `member_local_region_uk`(`user_id`, `region_id`),
    UNIQUE INDEX `member_local_region_order_uk`(`user_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_withdrawal` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `reason_code` VARCHAR(20) NULL,
    `reason_detail` VARCHAR(255) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_account` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `provider` CHAR(1) NOT NULL,
    `provider_id` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `social_account_provider_uk`(`provider`, `provider_id`),
    UNIQUE INDEX `social_account_user_provider_uk`(`user_id`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_token` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_token_token_hash_key`(`token_hash`),
    INDEX `refresh_token_user_idx`(`user_id`),
    INDEX `refresh_token_expires_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_temporary_token` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `token_hash` CHAR(64) NOT NULL,
    `token_type` VARCHAR(20) NOT NULL,
    `payload` JSON NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_temporary_token_token_hash_key`(`token_hash`),
    INDEX `auth_temporary_token_type_expires_idx`(`token_type`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_consent` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `consent_type` VARCHAR(20) NOT NULL,
    `agreed` BOOLEAN NOT NULL DEFAULT false,
    `policy_version` VARCHAR(20) NOT NULL,
    `agreed_at` DATETIME(3) NULL,
    `withdrawn_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_consent_user_type_id_idx`(`user_id`, `consent_type`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_subscription` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `endpoint` VARCHAR(1024) NOT NULL,
    `endpoint_hash` CHAR(64) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `user_agent` VARCHAR(255) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_date` DATETIME(3) NULL,

    UNIQUE INDEX `push_subscription_endpoint_hash_key`(`endpoint_hash`),
    INDEX `push_subscription_user_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `region` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(10) NOT NULL,
    `name` VARCHAR(20) NOT NULL,
    `full_name` VARCHAR(60) NOT NULL,
    `level` TINYINT NOT NULL,
    `parent_id` INTEGER NULL,
    `center_lat` DECIMAL(10, 7) NULL,
    `center_lng` DECIMAL(10, 7) NULL,
    `bg_key` VARCHAR(40) NULL,

    UNIQUE INDEX `region_code_key`(`code`),
    INDEX `region_parent_name_idx`(`parent_id`, `name`),
    INDEX `region_level_idx`(`level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `season` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `season_no` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'U',
    `finalized_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `season_season_no_key`(`season_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(20) NOT NULL,
    `sort_order` TINYINT NOT NULL DEFAULT 0,

    UNIQUE INDEX `category_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `restaurant` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `kakao_place_id` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `category_id` INTEGER NULL,
    `kakao_category_name` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `road_address` VARCHAR(255) NULL,
    `jibun_address` VARCHAR(255) NULL,
    `region_id` INTEGER NOT NULL,
    `sigungu_id` INTEGER NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `business_no` VARCHAR(12) NULL,
    `business_hours` JSON NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_date` DATETIME(3) NULL,

    UNIQUE INDEX `restaurant_kakao_place_id_key`(`kakao_place_id`),
    INDEX `restaurant_sigungu_category_idx`(`sigungu_id`, `category_id`),
    INDEX `restaurant_region_category_idx`(`region_id`, `category_id`),
    INDEX `restaurant_latlng_idx`(`lat`, `lng`),
    INDEX `restaurant_business_no_idx`(`business_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `restaurant_stat` (
    `restaurant_id` BIGINT NOT NULL,
    `review_count` INTEGER NOT NULL DEFAULT 0,
    `text_review_count` INTEGER NOT NULL DEFAULT 0,
    `photo_review_count` INTEGER NOT NULL DEFAULT 0,
    `score_sum` DECIMAL(12, 1) NOT NULL DEFAULT 0,
    `weight_sum` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `weighted_score_sum` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `taste_sum` INTEGER NOT NULL DEFAULT 0,
    `cleanliness_sum` INTEGER NOT NULL DEFAULT 0,
    `portion_sum` INTEGER NOT NULL DEFAULT 0,
    `service_sum` INTEGER NOT NULL DEFAULT 0,
    `price_sum` INTEGER NOT NULL DEFAULT 0,
    `detail_review_count` INTEGER NOT NULL DEFAULT 0,
    `revisit_intent_count` INTEGER NOT NULL DEFAULT 0,
    `visit_count` INTEGER NOT NULL DEFAULT 0,
    `local_visit_count` INTEGER NOT NULL DEFAULT 0,
    `visitor_count` INTEGER NOT NULL DEFAULT 0,
    `revisitor_count` INTEGER NOT NULL DEFAULT 0,
    `conqueror_count` INTEGER NOT NULL DEFAULT 0,
    `save_count` INTEGER NOT NULL DEFAULT 0,
    `update_date` DATETIME(3) NULL,

    PRIMARY KEY (`restaurant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saved_restaurant` (
    `user_id` BIGINT NOT NULL,
    `restaurant_id` BIGINT NOT NULL,
    `reminded_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `saved_restaurant_user_date_idx`(`user_id`, `reg_date`),
    PRIMARY KEY (`user_id`, `restaurant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `search_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `keyword` VARCHAR(50) NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `search_history_user_date_idx`(`user_id`, `reg_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visit` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `restaurant_id` BIGINT NULL,
    `season_id` INTEGER NULL,
    `method` CHAR(1) NOT NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'P',
    `fail_reason` VARCHAR(20) NULL,
    `receipt_image_key` VARCHAR(255) NULL,
    `ocr_raw` JSON NULL,
    `ocr_store_name` VARCHAR(100) NULL,
    `ocr_business_no` VARCHAR(12) NULL,
    `ocr_approval_no` VARCHAR(20) NULL,
    `store_name_matched` BOOLEAN NULL,
    `business_no_matched` BOOLEAN NULL,
    `paid_at` DATETIME(3) NULL,
    `total_amount` INTEGER NULL,
    `receipt_hash` CHAR(64) NULL,
    `checkin_lat` DECIMAL(10, 7) NULL,
    `checkin_lng` DECIMAL(10, 7) NULL,
    `checkin_accuracy` SMALLINT NULL,
    `checkin_distance_m` SMALLINT NULL,
    `checkin_at` DATETIME(3) NULL,
    `site_photo_key` VARCHAR(255) NULL,
    `photo_taken_at` DATETIME(3) NULL,
    `photo_lat` DECIMAL(10, 7) NULL,
    `photo_lng` DECIMAL(10, 7) NULL,
    `is_local` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_date` DATETIME(3) NULL,

    UNIQUE INDEX `visit_receipt_hash_key`(`receipt_hash`),
    INDEX `visit_user_date_idx`(`user_id`, `reg_date`),
    INDEX `visit_user_restaurant_idx`(`user_id`, `restaurant_id`, `status`),
    INDEX `visit_restaurant_status_idx`(`restaurant_id`, `status`),
    INDEX `visit_status_idx`(`status`, `reg_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `visit_receipt_item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `visit_id` BIGINT NOT NULL,
    `menu_name` VARCHAR(50) NOT NULL,
    `quantity` SMALLINT NOT NULL DEFAULT 1,
    `price` INTEGER NULL,

    INDEX `visit_receipt_item_visit_idx`(`visit_id`),
    INDEX `visit_receipt_item_menu_idx`(`menu_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conquest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `restaurant_id` BIGINT NOT NULL,
    `season_id` INTEGER NOT NULL,
    `sigungu_id` INTEGER NOT NULL,
    `visit_id` BIGINT NOT NULL,
    `conquered_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `conquest_visit_id_key`(`visit_id`),
    INDEX `conquest_season_sigungu_idx`(`season_id`, `sigungu_id`, `user_id`),
    INDEX `conquest_user_date_idx`(`user_id`, `conquered_at`),
    INDEX `conquest_restaurant_idx`(`restaurant_id`, `season_id`),
    UNIQUE INDEX `conquest_user_restaurant_season_uk`(`user_id`, `restaurant_id`, `season_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `visit_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `restaurant_id` BIGINT NOT NULL,
    `taste` TINYINT NOT NULL,
    `cleanliness` TINYINT NULL,
    `portion` TINYINT NULL,
    `service` TINYINT NULL,
    `price` TINYINT NULL,
    `score_avg` DECIMAL(2, 1) NOT NULL,
    `revisit_intent` BOOLEAN NULL,
    `content` VARCHAR(500) NULL,
    `content_reg_date` DATETIME(3) NULL,
    `image_count` TINYINT NOT NULL DEFAULT 0,
    `helpful_count` INTEGER NOT NULL DEFAULT 0,
    `unhelpful_count` INTEGER NOT NULL DEFAULT 0,
    `ai_result` JSON NULL,
    `ai_checked_at` DATETIME(3) NULL,
    `score_weight` DECIMAL(3, 2) NOT NULL DEFAULT 1,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_date` DATETIME(3) NULL,

    UNIQUE INDEX `review_visit_id_key`(`visit_id`),
    INDEX `review_restaurant_latest_idx`(`restaurant_id`, `status`, `reg_date`),
    INDEX `review_restaurant_helpful_idx`(`restaurant_id`, `status`, `helpful_count`),
    INDEX `review_user_date_idx`(`user_id`, `reg_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_image` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `review_id` BIGINT NOT NULL,
    `image_key` VARCHAR(255) NOT NULL,
    `sort_order` TINYINT NOT NULL DEFAULT 0,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `review_image_order_uk`(`review_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_reaction` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `review_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `type` CHAR(1) NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_date` DATETIME(3) NULL,

    INDEX `review_reaction_user_idx`(`user_id`),
    UNIQUE INDEX `review_reaction_review_user_uk`(`review_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `season_region_stat` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `season_id` INTEGER NOT NULL,
    `sigungu_id` INTEGER NOT NULL,
    `user_id` BIGINT NOT NULL,
    `conquest_count` INTEGER NOT NULL DEFAULT 0,
    `last_conquered_at` DATETIME(3) NULL,
    `rank_no` INTEGER NULL,
    `top_percent` DECIMAL(5, 2) NULL,
    `tier` CHAR(1) NOT NULL DEFAULT 'B',
    `celebrated_tier` CHAR(1) NOT NULL DEFAULT 'B',
    `is_finalized` BOOLEAN NOT NULL DEFAULT false,
    `update_date` DATETIME(3) NULL,

    INDEX `season_region_stat_rank_idx`(`season_id`, `sigungu_id`, `rank_no`),
    INDEX `season_region_stat_user_idx`(`user_id`, `season_id`),
    UNIQUE INDEX `season_region_stat_uk`(`season_id`, `sigungu_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `season_result` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `season_id` INTEGER NOT NULL,
    `user_id` BIGINT NOT NULL,
    `best_sigungu_id` INTEGER NOT NULL,
    `best_tier` CHAR(1) NOT NULL,
    `best_rank_no` INTEGER NOT NULL,
    `best_top_percent` DECIMAL(5, 2) NULL,
    `conquest_total` INTEGER NOT NULL DEFAULT 0,
    `reward_point` INTEGER NOT NULL DEFAULT 0,
    `reward_club_item_id` INTEGER NULL,
    `seen_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `season_result_uk`(`season_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `season_reward_rule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rule_type` CHAR(1) NOT NULL,
    `threshold` DECIMAL(5, 2) NOT NULL,
    `item_id` INTEGER NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `season_reward_rule_uk`(`rule_type`, `threshold`, `item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `achievement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `description` VARCHAR(255) NULL,
    `condition_type` VARCHAR(30) NOT NULL,
    `condition_value` INTEGER NOT NULL,
    `reward_point` INTEGER NOT NULL DEFAULT 0,
    `icon_key` VARCHAR(100) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` CHAR(1) NOT NULL DEFAULT 'A',

    UNIQUE INDEX `achievement_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_achievement` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `achievement_id` INTEGER NOT NULL,
    `season_id` INTEGER NULL,
    `achieved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `member_achievement_uk`(`user_id`, `achievement_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mukkaebi` (
    `user_id` BIGINT NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `exp` INTEGER NOT NULL DEFAULT 0,
    `hat_item_id` INTEGER NULL,
    `face_item_id` INTEGER NULL,
    `prop_item_id` INTEGER NULL,
    `skin_item_id` INTEGER NULL,
    `club_item_id` INTEGER NULL,
    `current_restaurant_id` BIGINT NULL,
    `bg_sigungu_id` INTEGER NULL,
    `celebrated_level` INTEGER NOT NULL DEFAULT 1,
    `update_date` DATETIME(3) NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_region_background` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `sigungu_id` INTEGER NOT NULL,
    `unlocked_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `member_region_background_uk`(`user_id`, `sigungu_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `level_policy` (
    `level` INTEGER NOT NULL,
    `required_exp` INTEGER NOT NULL,
    `stage` CHAR(1) NOT NULL,
    `size_percent` TINYINT NOT NULL DEFAULT 100,
    `reward_point` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reward_policy` (
    `reason` VARCHAR(30) NOT NULL,
    `point` INTEGER NOT NULL DEFAULT 0,
    `exp` INTEGER NOT NULL DEFAULT 0,
    `daily_limit` INTEGER NULL,
    `description` VARCHAR(100) NULL,

    PRIMARY KEY (`reason`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `point_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `amount` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `reason` VARCHAR(30) NOT NULL,
    `title` VARCHAR(60) NOT NULL,
    `ref_type` VARCHAR(20) NULL,
    `ref_id` BIGINT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `point_history_user_idx`(`user_id`, `id`),
    UNIQUE INDEX `point_history_once_uk`(`user_id`, `reason`, `ref_type`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exp_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `amount` INTEGER NOT NULL,
    `reason` VARCHAR(30) NOT NULL,
    `ref_type` VARCHAR(20) NULL,
    `ref_id` BIGINT NULL,
    `level_after` INTEGER NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exp_history_user_idx`(`user_id`, `id`),
    UNIQUE INDEX `exp_history_once_uk`(`user_id`, `reason`, `ref_type`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `category` VARCHAR(10) NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `description` VARCHAR(255) NULL,
    `price` INTEGER NULL,
    `unlock_type` CHAR(1) NOT NULL DEFAULT 'P',
    `club_tier` TINYINT NULL,
    `required_achievement_id` INTEGER NULL,
    `badge` VARCHAR(10) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `sale_start` DATETIME(3) NULL,
    `sale_end` DATETIME(3) NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `item_code_key`(`code`),
    INDEX `item_category_idx`(`category`, `status`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_recipe` (
    `result_item_id` INTEGER NOT NULL,
    `material_item_id` INTEGER NOT NULL,
    `material_count` TINYINT NOT NULL DEFAULT 3,

    PRIMARY KEY (`result_item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `acquired_type` CHAR(1) NOT NULL,
    `season_id` INTEGER NULL,
    `acquired_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `seen_at` DATETIME(3) NULL,

    INDEX `member_item_new_idx`(`user_id`, `seen_at`),
    UNIQUE INDEX `member_item_uk`(`user_id`, `item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `category` VARCHAR(10) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `title` VARCHAR(60) NOT NULL,
    `content` VARCHAR(255) NOT NULL,
    `ref_type` VARCHAR(20) NULL,
    `ref_id` BIGINT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_user_read_idx`(`user_id`, `is_read`, `id`),
    INDEX `notification_user_category_idx`(`user_id`, `category`, `id`),
    INDEX `notification_reg_date_idx`(`reg_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `tag` VARCHAR(10) NULL,
    `is_pinned` BOOLEAN NOT NULL DEFAULT false,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_date` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faq` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category` VARCHAR(20) NOT NULL,
    `question` VARCHAR(100) NOT NULL,
    `answer` TEXT NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` CHAR(1) NOT NULL DEFAULT 'A',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_document` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(20) NOT NULL,
    `version` VARCHAR(20) NOT NULL,
    `content` TEXT NOT NULL,
    `effective_date` DATE NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `policy_document_type_date_idx`(`type`, `effective_date`),
    UNIQUE INDEX `policy_document_type_version_uk`(`type`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inquiry` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `content` VARCHAR(1000) NOT NULL,
    `ref_visit_id` BIGINT NULL,
    `image_key` VARCHAR(255) NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'W',
    `answer` VARCHAR(1000) NULL,
    `answered_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inquiry_user_idx`(`user_id`, `reg_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `reporter_id` BIGINT NOT NULL,
    `target_type` CHAR(1) NOT NULL,
    `target_id` BIGINT NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `detail` VARCHAR(200) NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'P',
    `processed_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `report_target_idx`(`target_type`, `target_id`),
    UNIQUE INDEX `report_once_uk`(`reporter_id`, `target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_block` (
    `blocker_id` BIGINT NOT NULL,
    `blocked_id` BIGINT NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`blocker_id`, `blocked_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `member_local_region` ADD CONSTRAINT `member_local_region_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_local_region` ADD CONSTRAINT `member_local_region_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_local_region` ADD CONSTRAINT `member_local_region_sigungu_id_fkey` FOREIGN KEY (`sigungu_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_withdrawal` ADD CONSTRAINT `member_withdrawal_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_account` ADD CONSTRAINT `social_account_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_token` ADD CONSTRAINT `refresh_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_consent` ADD CONSTRAINT `member_consent_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `push_subscription` ADD CONSTRAINT `push_subscription_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `region` ADD CONSTRAINT `region_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `region`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant` ADD CONSTRAINT `restaurant_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant` ADD CONSTRAINT `restaurant_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant` ADD CONSTRAINT `restaurant_sigungu_id_fkey` FOREIGN KEY (`sigungu_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restaurant_stat` ADD CONSTRAINT `restaurant_stat_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_restaurant` ADD CONSTRAINT `saved_restaurant_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_restaurant` ADD CONSTRAINT `saved_restaurant_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `search_history` ADD CONSTRAINT `search_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visit` ADD CONSTRAINT `visit_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visit` ADD CONSTRAINT `visit_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `visit` ADD CONSTRAINT `visit_season_id_fkey` FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `visit_receipt_item` ADD CONSTRAINT `visit_receipt_item_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conquest` ADD CONSTRAINT `conquest_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conquest` ADD CONSTRAINT `conquest_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conquest` ADD CONSTRAINT `conquest_season_id_fkey` FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conquest` ADD CONSTRAINT `conquest_sigungu_id_fkey` FOREIGN KEY (`sigungu_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conquest` ADD CONSTRAINT `conquest_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review` ADD CONSTRAINT `review_visit_id_fkey` FOREIGN KEY (`visit_id`) REFERENCES `visit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review` ADD CONSTRAINT `review_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review` ADD CONSTRAINT `review_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_image` ADD CONSTRAINT `review_image_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_reaction` ADD CONSTRAINT `review_reaction_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_reaction` ADD CONSTRAINT `review_reaction_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_region_stat` ADD CONSTRAINT `season_region_stat_season_id_fkey` FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_region_stat` ADD CONSTRAINT `season_region_stat_sigungu_id_fkey` FOREIGN KEY (`sigungu_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_region_stat` ADD CONSTRAINT `season_region_stat_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_result` ADD CONSTRAINT `season_result_season_id_fkey` FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_result` ADD CONSTRAINT `season_result_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_result` ADD CONSTRAINT `season_result_best_sigungu_id_fkey` FOREIGN KEY (`best_sigungu_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_result` ADD CONSTRAINT `season_result_reward_club_item_id_fkey` FOREIGN KEY (`reward_club_item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `season_reward_rule` ADD CONSTRAINT `season_reward_rule_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_achievement` ADD CONSTRAINT `member_achievement_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_achievement` ADD CONSTRAINT `member_achievement_achievement_id_fkey` FOREIGN KEY (`achievement_id`) REFERENCES `achievement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_achievement` ADD CONSTRAINT `member_achievement_season_id_fkey` FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_hat_item_id_fkey` FOREIGN KEY (`hat_item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_face_item_id_fkey` FOREIGN KEY (`face_item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_prop_item_id_fkey` FOREIGN KEY (`prop_item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_skin_item_id_fkey` FOREIGN KEY (`skin_item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_club_item_id_fkey` FOREIGN KEY (`club_item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_current_restaurant_id_fkey` FOREIGN KEY (`current_restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mukkaebi` ADD CONSTRAINT `mukkaebi_bg_sigungu_id_fkey` FOREIGN KEY (`bg_sigungu_id`) REFERENCES `region`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_region_background` ADD CONSTRAINT `member_region_background_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_region_background` ADD CONSTRAINT `member_region_background_sigungu_id_fkey` FOREIGN KEY (`sigungu_id`) REFERENCES `region`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `point_history` ADD CONSTRAINT `point_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exp_history` ADD CONSTRAINT `exp_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item` ADD CONSTRAINT `item_required_achievement_id_fkey` FOREIGN KEY (`required_achievement_id`) REFERENCES `achievement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_recipe` ADD CONSTRAINT `item_recipe_result_item_id_fkey` FOREIGN KEY (`result_item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_recipe` ADD CONSTRAINT `item_recipe_material_item_id_fkey` FOREIGN KEY (`material_item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_item` ADD CONSTRAINT `member_item_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_item` ADD CONSTRAINT `member_item_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_item` ADD CONSTRAINT `member_item_season_id_fkey` FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inquiry` ADD CONSTRAINT `inquiry_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inquiry` ADD CONSTRAINT `inquiry_ref_visit_id_fkey` FOREIGN KEY (`ref_visit_id`) REFERENCES `visit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report` ADD CONSTRAINT `report_reporter_id_fkey` FOREIGN KEY (`reporter_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_block` ADD CONSTRAINT `member_block_blocker_id_fkey` FOREIGN KEY (`blocker_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_block` ADD CONSTRAINT `member_block_blocked_id_fkey` FOREIGN KEY (`blocked_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK 제약 (ERD checks) — Prisma 스키마로 표현할 수 없어 직접 추가한다
ALTER TABLE `member` ADD CONSTRAINT `member_point_balance_chk` CHECK (point_balance >= 0);
ALTER TABLE `member` ADD CONSTRAINT `member_trust_temp_chk` CHECK (trust_temp between 0 and 99.9);
ALTER TABLE `member` ADD CONSTRAINT `member_login_fail_chk` CHECK (login_fail_count between 0 and 5);
ALTER TABLE `member_local_region` ADD CONSTRAINT `member_local_region_order_chk` CHECK (sort_order between 0 and 2);
ALTER TABLE `season` ADD CONSTRAINT `season_period_chk` CHECK (start_date < end_date);
ALTER TABLE `visit` ADD CONSTRAINT `visit_restaurant_required_chk` CHECK (status in ('P','R','F') or restaurant_id is not null);
ALTER TABLE `visit` ADD CONSTRAINT `visit_amount_chk` CHECK (total_amount is null or total_amount >= 0);
ALTER TABLE `visit` ADD CONSTRAINT `visit_method_chk` CHECK (method in ('R','S'));
ALTER TABLE `visit` ADD CONSTRAINT `visit_receipt_image_chk` CHECK (method <> 'R' or receipt_image_key is not null);
ALTER TABLE `visit` ADD CONSTRAINT `visit_checkin_chk` CHECK (method <> 'S' or (checkin_lat is not null and checkin_lng is not null));
ALTER TABLE `visit` ADD CONSTRAINT `visit_site_photo_chk` CHECK (method <> 'S' or status not in ('V','C') or site_photo_key is not null);
ALTER TABLE `review` ADD CONSTRAINT `review_taste_chk` CHECK (taste between 1 and 5);
ALTER TABLE `review` ADD CONSTRAINT `review_detail_score_chk` CHECK ((cleanliness is null or cleanliness between 1 and 5) and (portion is null or portion between 1 and 5) and (service is null or service between 1 and 5) and (price is null or price between 1 and 5));
ALTER TABLE `review` ADD CONSTRAINT `review_image_count_chk` CHECK (image_count between 0 and 5);
ALTER TABLE `review` ADD CONSTRAINT `review_weight_chk` CHECK (score_weight between 0 and 1);
ALTER TABLE `season_reward_rule` ADD CONSTRAINT `season_reward_rule_type_chk` CHECK (rule_type in ('R','P'));
ALTER TABLE `level_policy` ADD CONSTRAINT `level_policy_stage_chk` CHECK (stage in ('E','B','K','A'));
ALTER TABLE `level_policy` ADD CONSTRAINT `level_policy_size_chk` CHECK (size_percent between 1 and 100);
ALTER TABLE `item` ADD CONSTRAINT `item_category_chk` CHECK (category in ('HAT','FACE','PROP','SKIN','CLUB'));
ALTER TABLE `item` ADD CONSTRAINT `item_price_chk` CHECK (price is null or price >= 0);
ALTER TABLE `item` ADD CONSTRAINT `item_purchase_price_chk` CHECK (unlock_type <> 'P' or price is not null);
ALTER TABLE `item` ADD CONSTRAINT `item_club_chk` CHECK (category <> 'CLUB' or (club_tier between 1 and 5 and price is null and ((club_tier < 5 and unlock_type = 'S') or (club_tier = 5 and unlock_type = 'M'))));
ALTER TABLE `item` ADD CONSTRAINT `item_club_tier_chk` CHECK (category = 'CLUB' or club_tier is null);
ALTER TABLE `item` ADD CONSTRAINT `item_craft_chk` CHECK (unlock_type <> 'M' or (category = 'CLUB' and club_tier = 5));
ALTER TABLE `item_recipe` ADD CONSTRAINT `item_recipe_count_chk` CHECK (material_count >= 2);
ALTER TABLE `member_item` ADD CONSTRAINT `member_item_quantity_chk` CHECK (quantity >= 0);
