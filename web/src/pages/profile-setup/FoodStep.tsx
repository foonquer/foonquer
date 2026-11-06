import check from '../../assets/icons/check.svg';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import choice from '../../components/ChoiceGroup.module.css';
import { StepHeader } from './StepHeader';
import styles from './ProfileSetup.module.css';

/** 음식 종류 12개 (서버 prisma/seed-data.ts의 category id 순서 = 칩 순서) */
const FOOD_CATEGORIES = [
  { categoryId: 1, name: '한식' },
  { categoryId: 2, name: '중식' },
  { categoryId: 3, name: '일식' },
  { categoryId: 4, name: '양식' },
  { categoryId: 5, name: '분식' },
  { categoryId: 6, name: '고깃집' },
  { categoryId: 7, name: '해산물' },
  { categoryId: 8, name: '치킨' },
  { categoryId: 9, name: '패스트푸드' },
  { categoryId: 10, name: '아시안' },
  { categoryId: 11, name: '카페·디저트' },
  { categoryId: 12, name: '기타' },
] as const;

type Props = {
  categoryIds: number[];
  onChange: (categoryIds: number[]) => void;
  onNext: () => void;
};

/** S-05-1 좋아하는 음식 (여러 개 고르기, 첫 추천 맛집에 반영) */
export function FoodStep({ categoryIds, onChange, onNext }: Props) {
  const toggle = (id: number) =>
    onChange(
      categoryIds.includes(id)
        ? categoryIds.filter((c) => c !== id)
        : // 칩 순서대로 둔다
          FOOD_CATEGORIES.map((c) => c.categoryId).filter(
            (c) => c === id || categoryIds.includes(c),
          ),
    );

  return (
    <Screen
      footer={
        <Button onClick={onNext} disabled={categoryIds.length === 0}>
          다음
        </Button>
      }
    >
      <StepHeader
        step={2}
        name="좋아하는 음식"
        title={'좋아하는 음식을\n골라 주세요'}
        description="여러 개 골라도 돼요 · 첫 추천 맛집에 반영돼요"
      />
      <div className={styles.content}>
        <fieldset className={choice.group}>
          <legend className={choice.legend}>음식 종류 · 여러 개 선택</legend>
          <div className={choice.grid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {FOOD_CATEGORIES.map(({ categoryId, name }) => {
              const selected = categoryIds.includes(categoryId);
              return (
                <button
                  key={categoryId}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  className={choice.option}
                  style={{ height: 48 }}
                  onClick={() => toggle(categoryId)}
                >
                  {selected && <img src={check} alt="" width={18} height={18} />}
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Screen>
  );
}
