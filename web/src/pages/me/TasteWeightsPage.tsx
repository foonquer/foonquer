import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getTasteWeights, saveTasteWeights, type TasteWeights } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { PageTitle } from '../../components/PageTitle';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { TasteWeightsForm } from '../../components/TasteWeightsForm';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import styles from './TasteWeightsPage.module.css';

async function loadWeights(): Promise<TasteWeights> {
  const { items } = await getTasteWeights();
  return Object.fromEntries(items.map((i) => [i.key, i.level])) as TasteWeights;
}

/** 내 취향 설정 /me/taste (USER-09·10) */
export function TasteWeightsPage() {
  const { data, error, reload } = useAsync(loadWeights, []);
  if (error) {
    return (
      <Screen>
        <AppHeader title="내 취향 설정" />
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <AppHeader title="내 취향 설정" />
        <Loading />
      </Screen>
    );
  }
  return <Form initial={data} />;
}

function Form({ initial }: { initial: TasteWeights }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [weights, setWeights] = useState(initial);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(weights) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    try {
      const { message } = await saveTasteWeights(weights);
      toast({ message, check: true });
      navigate(-1);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <Button onClick={save} disabled={!changed || saving}>
          저장하기
        </Button>
      }
    >
      <AppHeader title="내 취향 설정" />
      <div className={styles.content}>
        <PageTitle
          className={styles.title}
          title={'맛집 고를 때\n무엇을 중요하게 보세요?'}
          description={
            '바꾸면 모든 가게의 "내 종합 별점"이 바로 다시 계산돼요. 맛 별점은 그대로예요.'
          }
        />
        <TasteWeightsForm value={weights} onChange={setWeights} />
      </div>
    </Screen>
  );
}
