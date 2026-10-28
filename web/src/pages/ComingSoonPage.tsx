import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { EmptyState } from '../components/StateViews';

type Props = {
  title: string;
  /** 하단 탭 화면이면 뒤로 가기를 숨긴다 */
  tab?: boolean;
};

/**
 * 아직 만들지 않은 화면 자리 (다른 사람이 맡은 기능).
 * 담당자가 화면을 만들면 router.tsx에서 이 자리를 그 화면으로 바꾼다.
 */
export function ComingSoonPage({ title, tab }: Props) {
  return (
    <Screen inTab={tab}>
      <AppHeader title={title} hideBack={tab} />
      <EmptyState title="준비 중이에요" description={`${title} 화면은 곧 만나요!`} />
    </Screen>
  );
}
