-- 「신뢰 별점 계산 규칙 정리」(2026-11-13) 반영

-- 일관성 가중치 w_cons (하루 1번 rating 작업이 다시 정한다)
ALTER TABLE `member` ADD COLUMN `consistency_weight` DECIMAL(3, 2) NOT NULL DEFAULT 1.00 AFTER `trust_temp`;

-- 리뷰 가중치 범위: clamp(w_user × w_help, 0.1, 2.0) × w_cons(0.7~1.3) ÷ 함께 정복 인원 → 0~2.6
ALTER TABLE `review` DROP CHECK `review_weight_chk`;
ALTER TABLE `review` ADD CONSTRAINT `review_weight_chk` CHECK (score_weight between 0 and 2.6);

-- 계수: 가중치 하한 0.5 → 0.1, 전체 평균 m(GLOBAL_MEAN)은 동네 평균으로 바뀌고 재방문 가중치는 뺐다. 새 계수는 seed가 넣는다
UPDATE `rating_param` SET `value` = 0.1, `description` = 'clamp(w_user × w_help) 하한' WHERE `code` = 'TRUST_MIN';
DELETE FROM `rating_param` WHERE `code` IN ('GLOBAL_MEAN', 'REVISIT_WEIGHT');
