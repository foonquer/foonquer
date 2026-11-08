-- 가게 기본 정보를 카카오 로컬 API 대신 공공데이터(소상공인시장진흥공단 상가(상권)정보)로 채운다 (#85)
-- 카카오 결과는 실시간 표시만 할 수 있고 장소 ID 말고는 저장하면 안 된다

-- 공공데이터 상가업소번호. 기존(카카오에서 저장한) 가게는 주기 작업 store-import가 이름·거리로 공공데이터 가게와 이어 준다
ALTER TABLE `restaurant` ADD COLUMN `bizes_id` VARCHAR(30) NULL AFTER `id`,
  ADD UNIQUE INDEX `restaurant_bizes_id_key`(`bizes_id`);

-- 카카오 장소 ID는 상세 화면에서 같은 가게를 찾았을 때만 저장한다
ALTER TABLE `restaurant` MODIFY `kakao_place_id` VARCHAR(20) NULL;

-- 카카오에서 받은 전화번호·분류는 지운다 (전화번호는 상세 화면에서 카카오로 실시간 조회)
ALTER TABLE `restaurant` DROP COLUMN `phone`,
  DROP COLUMN `kakao_category_name`,
  ADD COLUMN `category_detail` VARCHAR(100) NULL AFTER `category_id`;
