import { AppHeader } from '../components/AppHeader';
import { ButtonLink } from '../components/Button';
import { Screen } from '../components/Screen';
import { EmptyState } from '../components/StateViews';

export function NotFoundPage() {
  return (
    <Screen footer={<ButtonLink to="/">홈으로</ButtonLink>}>
      <AppHeader />
      <EmptyState
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 없어진 화면이에요."
      />
    </Screen>
  );
}
