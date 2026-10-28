import { AGE_LABEL, GENDER_LABEL, type AgeGroup, type Gender } from '../../api/users';
import { Button } from '../../components/Button';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { Screen } from '../../components/Screen';
import { StepHeader } from './StepHeader';
import styles from './ProfileSetup.module.css';

const GENDERS = (['F', 'M', 'N'] as const).map((value) => ({ value, label: GENDER_LABEL[value] }));
const AGES = ([10, 20, 30, 40, 50] as const).map((value) => ({ value, label: AGE_LABEL[value] }));

type Props = {
  gender: Gender | null;
  ageGroup: AgeGroup | null;
  onChange: (patch: { gender?: Gender; ageGroup?: AgeGroup }) => void;
  onNext: () => void;
};

/** S-05 성별·나이대 */
export function InfoStep({ gender, ageGroup, onChange, onNext }: Props) {
  return (
    <Screen
      footer={
        <Button onClick={onNext} disabled={!gender || !ageGroup}>
          다음
        </Button>
      }
    >
      <StepHeader
        step={2}
        name="기본 정보"
        title={'나에게 맞는 맛집을\n추천해 드릴게요'}
        description="다른 사람에게는 공개되지 않아요"
      />
      <div className={styles.content} data-gap="choices">
        <ChoiceGroup
          label="성별"
          options={GENDERS}
          value={gender}
          onChange={(g) => onChange({ gender: g })}
          columns={3}
          height={56}
          withCheck
        />
        <ChoiceGroup
          label="나이대"
          options={AGES}
          value={ageGroup}
          onChange={(a) => onChange({ ageGroup: a })}
          columns={2}
          height={52}
          withCheck
        />
      </div>
    </Screen>
  );
}
