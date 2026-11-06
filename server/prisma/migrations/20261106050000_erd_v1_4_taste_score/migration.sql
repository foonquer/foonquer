-- ERD v1.4 (2026-11-06, 피그마 3-2 "맛 별점 · 내 종합 별점")
-- 별점 남기기 1단계는 맛 별점(review.overall_score, 0.5~5.0 맛 기준표). 세부평가에서 맛을 빼고 청결·양·서비스·가격 4항목
-- 내 종합 별점 = 항목 평균 × 내 취향 비중 (member.weight_* — 1 보통 / 2 중요 / 3 아주 중요)

-- 세부 별점에서 맛 빼기
ALTER TABLE `review` DROP CHECK `review_detail_score_chk`;
ALTER TABLE `review` DROP COLUMN `taste`;
ALTER TABLE `review` ADD CONSTRAINT `review_detail_score_chk` CHECK ((cleanliness is null and portion is null and service is null and price is null) or (cleanliness is not null and portion is not null and service is not null and price is not null and cleanliness between 1 and 5 and portion between 1 and 5 and service between 1 and 5 and price between 1 and 5));
ALTER TABLE `restaurant_stat` DROP COLUMN `taste_sum`;

-- 내 취향 (가입 때 고르고 설정에서 바꾼다). 고르지 않으면 모두 보통(같은 비중)
ALTER TABLE `member` ADD COLUMN `weight_taste` TINYINT NOT NULL DEFAULT 1 AFTER `marketing_alarm`,
  ADD COLUMN `weight_cleanliness` TINYINT NOT NULL DEFAULT 1 AFTER `weight_taste`,
  ADD COLUMN `weight_portion` TINYINT NOT NULL DEFAULT 1 AFTER `weight_cleanliness`,
  ADD COLUMN `weight_service` TINYINT NOT NULL DEFAULT 1 AFTER `weight_portion`,
  ADD COLUMN `weight_price` TINYINT NOT NULL DEFAULT 1 AFTER `weight_service`;
ALTER TABLE `member` ADD CONSTRAINT `member_taste_weight_chk` CHECK (weight_taste between 1 and 3 and weight_cleanliness between 1 and 3 and weight_portion between 1 and 3 and weight_service between 1 and 3 and weight_price between 1 and 3);

-- 다시 먹을 의향은 맛 별점 3.0 이상 (전에는 종합 별점 2.5 이상). 쌓인 수를 새 기준으로 다시 센다
UPDATE `restaurant_stat` s
SET `revisit_intent_count` = (
  SELECT COUNT(*) FROM `review` r
  WHERE r.`restaurant_id` = s.`restaurant_id` AND r.`status` = 'A' AND r.`overall_score` >= 3.0
);
