-- 가게 대표 사진: 공개 리뷰 중 가장 최근 것의 첫 사진 (리뷰가 바뀔 때 refreshRestaurantStat이 다시 고른다)
ALTER TABLE `restaurant_stat` ADD COLUMN `cover_image_key` VARCHAR(255) NULL AFTER `photo_review_count`;

-- 이미 있는 리뷰 사진으로 바로 채운다
UPDATE `restaurant_stat` s
SET s.`cover_image_key` = (
  SELECT ri.`image_key`
  FROM `review` r
  JOIN `review_image` ri ON ri.`review_id` = r.`id`
  WHERE r.`restaurant_id` = s.`restaurant_id` AND r.`status` = 'A'
  ORDER BY r.`reg_date` DESC, r.`id` DESC, ri.`sort_order` ASC
  LIMIT 1
);
