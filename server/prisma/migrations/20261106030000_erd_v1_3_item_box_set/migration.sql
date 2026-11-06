-- ERD v1.3 (2026-11-06, 피그마 8. 먹깨비 · 상점 · 꾸미기)
-- 아이템 등급, 성장 보상 아이템 상자, 아이템 세트, 업적 보상 아이템(명예) / 시즌 보상은 방망이만

-- AlterTable
ALTER TABLE `item` ADD COLUMN `rarity` CHAR(1) NOT NULL DEFAULT 'N' AFTER `unlock_type`;
ALTER TABLE `item` ADD CONSTRAINT `item_rarity_chk` CHECK (rarity in ('N','R','E','L','H'));

-- CreateTable
CREATE TABLE `member_item_box` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `source_ref` INT NOT NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'U',
    `result_item_id` INT NULL,
    `result_point` INT NULL,
    `opened_at` DATETIME(3) NULL,
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `member_item_box_once_uk`(`user_id`, `source`, `source_ref`),
    INDEX `member_item_box_user_idx`(`user_id`, `status`),
    PRIMARY KEY (`id`),
    CONSTRAINT `member_item_box_status_chk` CHECK (status in ('U','O')),
    CONSTRAINT `member_item_box_opened_chk` CHECK ((status = 'U') = (opened_at is null))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_set` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `description` VARCHAR(255) NULL,
    `price` INT NOT NULL,
    `badge` VARCHAR(10) NULL,
    `sort_order` INT NOT NULL DEFAULT 0,
    `sale_start` DATETIME(3) NULL,
    `sale_end` DATETIME(3) NULL,
    `status` CHAR(1) NOT NULL DEFAULT 'A',
    `reg_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `item_set_code_key`(`code`),
    PRIMARY KEY (`id`),
    CONSTRAINT `item_set_price_chk` CHECK (price >= 0),
    CONSTRAINT `item_set_status_chk` CHECK (status in ('A','H'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_set_item` (
    `set_id` INT NOT NULL,
    `item_id` INT NOT NULL,

    INDEX `item_set_item_item_idx`(`item_id`),
    PRIMARY KEY (`set_id`, `item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `member_item_box` ADD CONSTRAINT `member_item_box_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `member_item_box` ADD CONSTRAINT `member_item_box_result_item_id_fkey` FOREIGN KEY (`result_item_id`) REFERENCES `item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `item_set_item` ADD CONSTRAINT `item_set_item_set_id_fkey` FOREIGN KEY (`set_id`) REFERENCES `item_set`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `item_set_item` ADD CONSTRAINT `item_set_item_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 이미 들어 있는 기본 데이터 고치기 (seed는 있는 행을 덮어쓰지 않는다)
-- 등급: 피그마 에셋 보드 (곰돌이 모자·하트/별 선글라스·외알 안경·정복 깃발·마이크 = 레어, 명예 아이템 = 명예, 전설의 방망이 = 전설)
UPDATE `item` SET `rarity` = 'R' WHERE `code` IN ('HAT_BEAR', 'FACE_HEART_SUNGLASSES', 'FACE_MONOCLE', 'FACE_STAR_SUNGLASSES', 'PROP_FLAG', 'PROP_MIC');
UPDATE `item` SET `rarity` = 'H' WHERE `code` IN ('HAT_CROWN', 'SKIN_NIGHTSKY', 'CLUB_WOOD', 'CLUB_BRONZE', 'CLUB_SILVER', 'CLUB_GOLD');
UPDATE `item` SET `rarity` = 'L' WHERE `code` = 'CLUB_LEGEND';
UPDATE `item` SET `badge` = 'NEW' WHERE `code` = 'HAT_STRAWBERRY' AND `badge` IS NULL;
UPDATE `item` SET `badge` = 'HOT' WHERE `code` = 'HAT_BEAR' AND `badge` IS NULL;

-- 업적 보상(명예): 왕관 ← 구의 먹짱, 밤하늘 먹깨비 ← 시즌 TOP 10, 황금 방망이 ← 한 시즌 30곳 정복(시즌 상위 10% 보상이기도 함)
-- 얻는 방법은 업적 행이 아직 없어도 바꾸고(seed가 나중에 업적을 만들면 연결한다), 업적 연결은 업적 행이 있을 때만
UPDATE `item` SET `unlock_type` = 'A', `description` = '구의 먹짱 업적을 달성하면 받아요.' WHERE `code` = 'HAT_CROWN';
UPDATE `item` SET `unlock_type` = 'A', `description` = '시즌 TOP 10 업적을 달성하면 받아요.' WHERE `code` = 'SKIN_NIGHTSKY';
UPDATE `item` i JOIN `achievement` a ON a.`code` = 'MUKJJANG'
   SET i.`required_achievement_id` = a.`id` WHERE i.`code` = 'HAT_CROWN';
UPDATE `item` i JOIN `achievement` a ON a.`code` = 'SEASON_TOP10'
   SET i.`required_achievement_id` = a.`id` WHERE i.`code` = 'SKIN_NIGHTSKY';
UPDATE `item` i JOIN `achievement` a ON a.`code` = 'SEASON_CONQUEST_30'
   SET i.`required_achievement_id` = a.`id` WHERE i.`code` = 'CLUB_GOLD';

-- 이미 그 업적을 달성한 회원에게 아직 없는 보상 아이템을 소급해서 준다 (이미 가진 방망이는 더 주지 않는다)
INSERT INTO `member_item` (`user_id`, `item_id`, `quantity`, `acquired_type`, `acquired_at`)
SELECT ma.`user_id`, i.`id`, 1, 'A', CURRENT_TIMESTAMP(3)
  FROM `member_achievement` ma
  JOIN `item` i ON i.`required_achievement_id` = ma.`achievement_id` AND i.`status` = 'A'
  JOIN `member` m ON m.`id` = ma.`user_id` AND m.`status` <> 'D'
  LEFT JOIN `member_item` mi ON mi.`user_id` = ma.`user_id` AND mi.`item_id` = i.`id`
 WHERE mi.`id` IS NULL;
-- 시즌 보상표는 방망이 4단계만 (왕관·밤하늘은 업적 보상으로)
DELETE r FROM `season_reward_rule` r JOIN `item` i ON i.`id` = r.`item_id` WHERE i.`code` IN ('HAT_CROWN', 'SKIN_NIGHTSKY');

-- 아이템 상자에서 줄 아이템이 없으면(모자·얼굴·소품을 다 가졌으면) 대신 주는 먹포인트
INSERT IGNORE INTO `reward_policy` (`reason`, `point`, `exp`, `daily_limit`, `description`) VALUES ('ITEM_BOX', 100, 0, NULL, '아이템 상자 (줄 아이템이 없을 때)');
