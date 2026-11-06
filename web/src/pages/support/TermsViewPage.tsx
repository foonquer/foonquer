import { useSearchParams } from 'react-router';
import { getTerms, type TermsType } from '../../api/support';
import { AppHeader } from '../../components/AppHeader';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import styles from './Support.module.css';

const TABS: { value: TermsType; label: string }[] = [
  { value: 'TERMS', label: '이용약관' },
  { value: 'PRIVACY', label: '개인정보 처리방침' },
  { value: 'LOCATION', label: '위치기반 서비스' },
];

/** "2026-09-01" → "2026.09.01" */
const dotDate = (d: string) => d.replaceAll('-', '.');

/**
 * 약관 및 정책 /terms?type=TERMS|PRIVACY|LOCATION|MARKETING&version= (CS-07, 로그인 없이)
 * 가입 화면의 [선택] 이벤트·혜택 알림(MARKETING)은 약관 문서가 없어 안내 문구만 보여 준다
 */
export function TermsViewPage() {
  const [params, setParams] = useSearchParams();
  const marketing = params.get('type') === 'MARKETING';
  const type = TABS.find((t) => t.value === params.get('type'))?.value ?? 'TERMS';
  const version = params.get('version') ?? undefined;
  const { data, error, reload } = useAsync(
    () => (marketing ? Promise.resolve(null) : getTerms(type, version)),
    [marketing, type, version],
  );

  return (
    <Screen>
      <AppHeader title="약관 및 정책" />
      <div className={styles.content}>
        <div className={styles.tabs} role="tablist" aria-label="약관 종류">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={!marketing && t.value === type}
              onClick={() => setParams({ type: t.value }, { replace: true })}
            >
              {t.label}
            </button>
          ))}
        </div>
        {marketing ? (
          <article className={styles.article}>
            <h2 className={styles.articleTitle}>[선택] 이벤트·혜택 알림</h2>
            <p className={styles.articleBody}>
              새 이벤트와 혜택 소식을 앱 알림으로 받는 데 동의하는 선택 항목이에요. 동의하지 않아도
              서비스를 모두 쓸 수 있고, 설정 → 알림에서 언제든 끌 수 있어요.
            </p>
          </article>
        ) : error ? (
          <EmptyState title={errorMessage(error)} onRetry={reload} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            {data.versions.length > 1 ? (
              <select
                className={styles.select}
                aria-label="시행일"
                value={data.version}
                onChange={(e) => setParams({ type, version: e.target.value }, { replace: true })}
              >
                {data.versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    시행일 {dotDate(v.effectiveDate)}
                  </option>
                ))}
              </select>
            ) : (
              <p className={styles.rowMeta}>시행일 {dotDate(data.effectiveDate)} (현재)</p>
            )}
            <article className={styles.article}>
              <p className={styles.articleBody}>{data.content}</p>
            </article>
          </>
        )}
      </div>
    </Screen>
  );
}
