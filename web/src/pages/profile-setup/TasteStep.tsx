import type { TasteWeights } from '../../api/users';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TasteWeightsForm } from '../../components/TasteWeightsForm';
import { StepHeader } from './StepHeader';
import styles from './ProfileSetup.module.css';

type Props = {
  weights: TasteWeights;
  onChange: (weights: TasteWeights) => void;
  onNext: () => void;
};

/** S-05-2 중요하게 보는 것 (내 종합 별점 비중, 나중에 설정에서 바꿀 수 있다) */
export function TasteStep({ weights, onChange, onNext }: Props) {
  return (
    <Screen footer={<Button onClick={onNext}>다음</Button>}>
      <StepHeader
        step={2}
        name="중요하게 보는 것"
        title={'맛집 고를 때\n무엇을 중요하게 보세요?'}
        description={'고른 만큼 "내 종합 별점"에 더 크게 반영돼요 · 나중에 바꿀 수 있어요'}
      />
      <div className={styles.content}>
        <TasteWeightsForm value={weights} onChange={onChange} />
      </div>
    </Screen>
  );
}
