-- ERD v1.0과 서버 DB 맞추기 (2026-11-05) — 별점 버전 5, 신뢰 온도·가중 별점 계산식, 내 동네 최대 2곳
-- 기존 데이터가 있어도 돌아가도록 값을 먼저 옮기고 제약을 건다

-- 1. 신뢰 온도: 1°~99°, 시작 50° (계산식 문서)
ALTER TABLE `member` DROP CHECK `member_trust_temp_chk`;
ALTER TABLE `member` MODIFY `trust_temp` DECIMAL(4, 2) NOT NULL DEFAULT 50;
-- 한 번도 바뀌지 않은 옛 시작값(36.5°)은 새 시작값으로, 나머지는 1~99로 자른다
UPDATE `member` SET `trust_temp` = 50 WHERE `trust_temp` = 36.5;
UPDATE `member` SET `trust_temp` = LEAST(GREATEST(`trust_temp`, 1), 99);
ALTER TABLE `member` ADD CONSTRAINT `member_trust_temp_chk` CHECK (trust_temp between 1 and 99);

-- 2. 내 동네 최대 2곳 (sort_order 0, 1). 3번째 동네(sort_order 2)는 지운다
DELETE FROM `member_local_region` WHERE `sort_order` >= 2;
ALTER TABLE `member_local_region` DROP CHECK `member_local_region_order_chk`;
ALTER TABLE `member_local_region` ADD CONSTRAINT `member_local_region_order_chk` CHECK (sort_order between 0 and 1);

-- 3. 리뷰: 종합 별점 필수 + 세부 별점 5항목 선택(모두 고르거나 모두 비움), 재방문 의사 칸은 종합 별점에 포함
ALTER TABLE `review` DROP CHECK `review_taste_chk`;
ALTER TABLE `review` DROP CHECK `review_detail_score_chk`;
ALTER TABLE `review` DROP CHECK `review_weight_chk`;

ALTER TABLE `review`
    ADD COLUMN `overall_score` DECIMAL(2, 1) NULL AFTER `restaurant_id`,
    MODIFY `taste` TINYINT NULL,
    ADD COLUMN `detail_reg_date` DATETIME(3) NULL AFTER `price`,
    ADD COLUMN `visitor_helpful_count` INTEGER NOT NULL DEFAULT 0 AFTER `helpful_count`,
    ADD COLUMN `is_revisit` BOOLEAN NOT NULL DEFAULT false AFTER `unhelpful_count`,
    ADD COLUMN `ad_suspected` BOOLEAN NOT NULL DEFAULT false AFTER `ai_checked_at`,
    MODIFY `score_weight` DECIMAL(4, 3) NOT NULL DEFAULT 1;

-- 옛 대표 별점(입력 항목 평균)을 종합 별점으로 옮긴다 (0.5 단위로 반올림)
UPDATE `review` SET `overall_score` = LEAST(GREATEST(ROUND(`score_avg` * 2) / 2, 0.5), 5.0);
-- 세부 별점을 다섯 항목 다 남기지 않은 리뷰는 세부 별점을 비운다 (옛 버전은 맛만 필수였다)
UPDATE `review` SET `taste` = NULL, `cleanliness` = NULL, `portion` = NULL, `service` = NULL, `price` = NULL
WHERE `taste` IS NULL OR `cleanliness` IS NULL OR `portion` IS NULL OR `service` IS NULL OR `price` IS NULL;
UPDATE `review` SET `detail_reg_date` = `reg_date` WHERE `taste` IS NOT NULL;
-- 세부 리뷰는 최대 300자
UPDATE `review` SET `content` = LEFT(`content`, 300) WHERE CHAR_LENGTH(`content`) > 300;
-- 가중치 범위 0.5~2.2
UPDATE `review` SET `score_weight` = LEAST(GREATEST(`score_weight`, 0.5), 2.2);

ALTER TABLE `review`
    MODIFY `overall_score` DECIMAL(2, 1) NOT NULL,
    MODIFY `content` VARCHAR(300) NULL,
    DROP COLUMN `score_avg`,
    DROP COLUMN `revisit_intent`;

CREATE INDEX `review_ad_suspected_idx` ON `review`(`ad_suspected`, `ai_checked_at`);

ALTER TABLE `review` ADD CONSTRAINT `review_overall_score_chk` CHECK (overall_score between 0.5 and 5.0 and overall_score * 2 = floor(overall_score * 2));
ALTER TABLE `review` ADD CONSTRAINT `review_detail_score_chk` CHECK ((taste is null and cleanliness is null and portion is null and service is null and price is null) or (taste is not null and cleanliness is not null and portion is not null and service is not null and price is not null and taste between 1 and 5 and cleanliness between 1 and 5 and portion between 1 and 5 and service between 1 and 5 and price between 1 and 5));
ALTER TABLE `review` ADD CONSTRAINT `review_weight_chk` CHECK (score_weight between 0.5 and 2.2);
ALTER TABLE `review` ADD CONSTRAINT `review_status_chk` CHECK (status in ('A','H','F','D'));

-- 가게 집계를 바뀐 리뷰 값으로 다시 계산한다 (공개 리뷰만): 단순 평균은 종합 별점 합, 세부 별점은 다섯 항목을 모두 남긴 리뷰만,
-- 재방문 의사는 종합 별점 2.5 이상 리뷰 수 (ERD restaurant_stat)
UPDATE `restaurant_stat` s
LEFT JOIN (
    SELECT
        `restaurant_id`,
        SUM(`overall_score`) AS score_sum,
        SUM(COALESCE(`taste`, 0)) AS taste_sum,
        SUM(COALESCE(`cleanliness`, 0)) AS cleanliness_sum,
        SUM(COALESCE(`portion`, 0)) AS portion_sum,
        SUM(COALESCE(`service`, 0)) AS service_sum,
        SUM(COALESCE(`price`, 0)) AS price_sum,
        SUM(`taste` IS NOT NULL) AS detail_review_count,
        SUM(`overall_score` >= 2.5) AS revisit_intent_count
    FROM `review`
    WHERE `status` = 'A'
    GROUP BY `restaurant_id`
) r ON r.`restaurant_id` = s.`restaurant_id`
SET
    s.`score_sum` = COALESCE(r.score_sum, 0),
    s.`taste_sum` = COALESCE(r.taste_sum, 0),
    s.`cleanliness_sum` = COALESCE(r.cleanliness_sum, 0),
    s.`portion_sum` = COALESCE(r.portion_sum, 0),
    s.`service_sum` = COALESCE(r.service_sum, 0),
    s.`price_sum` = COALESCE(r.price_sum, 0),
    s.`detail_review_count` = COALESCE(r.detail_review_count, 0),
    s.`revisit_intent_count` = COALESCE(r.revisit_intent_count, 0);

-- 4. 도움돼요·별로예요: 방문자 여부와 계산 반영 여부
ALTER TABLE `review_reaction`
    ADD COLUMN `is_visitor` BOOLEAN NOT NULL DEFAULT false AFTER `type`,
    ADD COLUMN `is_counted` BOOLEAN NOT NULL DEFAULT true AFTER `is_visitor`;

-- 5. 신고 사유별 처리 목록 (마패 확인)
CREATE INDEX `report_reason_status_idx` ON `report`(`reason`, `status`);

-- 6. 신뢰 온도 변화 기록
CREATE TABLE `trust_temp_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `base_delta` DECIMAL(4, 2) NOT NULL,
    `applied_delta` DECIMAL(4, 2) NOT NULL,
    `temp_after` DECIMAL(4, 2) NOT NULL,
    `actor_id` BIGINT NULL,
    `ref_type` VARCHAR(20) NOT NULL,
    `ref_id` BIGINT NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `trust_temp_log_once_uk`(`reason`, `ref_type`, `ref_id`),
    INDEX `trust_temp_log_user_date_idx`(`user_id`, `reg_date`),
    INDEX `trust_temp_log_actor_idx`(`user_id`, `actor_id`, `reg_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `trust_temp_log` ADD CONSTRAINT `trust_temp_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `trust_temp_log` ADD CONSTRAINT `trust_temp_log_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. 좋았던 점·아쉬웠던 점 칩 (항목 선택형 리뷰)
CREATE TABLE `review_aspect` (
    `id` TINYINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(20) NOT NULL,
    `sort_order` TINYINT NOT NULL DEFAULT 0,
    `status` CHAR(1) NOT NULL DEFAULT 'A',

    UNIQUE INDEX `review_aspect_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `review_aspect_mark` (
    `review_id` BIGINT NOT NULL,
    `aspect_id` TINYINT NOT NULL,
    `polarity` CHAR(1) NOT NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `review_aspect_mark_aspect_idx`(`aspect_id`),
    PRIMARY KEY (`review_id`, `aspect_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `review_aspect_mark` ADD CONSTRAINT `review_aspect_mark_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `review_aspect_mark` ADD CONSTRAINT `review_aspect_mark_aspect_id_fkey` FOREIGN KEY (`aspect_id`) REFERENCES `review_aspect`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `review_aspect_mark` ADD CONSTRAINT `review_aspect_mark_polarity_chk` CHECK (polarity in ('G','B'));

CREATE TABLE `restaurant_aspect_stat` (
    `restaurant_id` BIGINT NOT NULL,
    `aspect_id` TINYINT NOT NULL,
    `good_count` INTEGER NOT NULL DEFAULT 0,
    `bad_count` INTEGER NOT NULL DEFAULT 0,
    `recent_good_count` INTEGER NOT NULL DEFAULT 0,
    `recent_bad_count` INTEGER NOT NULL DEFAULT 0,
    `update_date` DATETIME(3) NULL,

    PRIMARY KEY (`restaurant_id`, `aspect_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `restaurant_aspect_stat` ADD CONSTRAINT `restaurant_aspect_stat_restaurant_id_fkey` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `restaurant_aspect_stat` ADD CONSTRAINT `restaurant_aspect_stat_aspect_id_fkey` FOREIGN KEY (`aspect_id`) REFERENCES `review_aspect`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. [2차] 개인화용 행동 기록
CREATE TABLE `member_activity_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `session_id` CHAR(36) NULL,
    `event_type` VARCHAR(30) NOT NULL,
    `screen` VARCHAR(40) NULL,
    `ref_type` VARCHAR(20) NULL,
    `ref_id` BIGINT NULL,
    `duration_sec` INTEGER NULL,
    `meta` JSON NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `member_activity_log_user_date_idx`(`user_id`, `reg_date`),
    INDEX `member_activity_log_type_date_idx`(`event_type`, `reg_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `member_activity_log` ADD CONSTRAINT `member_activity_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
