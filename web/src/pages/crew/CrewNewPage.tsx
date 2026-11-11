import { useState } from 'react';
import { useNavigate } from 'react-router';
import { createCrew, type CrewType } from '../../api/crews';
import { getLocalRegions } from '../../api/users';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { LockIcon, UsersIcon } from '../quest/QuestIcons';
import { CrewTypeIcon } from './CrewParts';
import styles from './Crew.module.css';

const NAME_MAX = 12;

const TYPES: { type: CrewType; name: string; size: string; text: string }[] = [
  { type: 'FRIEND', name: '친구', size: '2~8명', text: '친구·동기와 같이 정복해요' },
  { type: 'FAMILY', name: '가족', size: '2~8명', text: '부모님·아이와 같이 정복해요' },
  { type: 'COUPLE', name: '연인', size: '2명', text: '둘이서 데이트 코스를 정복해요' },
];

/** 모임 만들기 /crews/new: 누구와 함께해요? (피그마 G2) → 이름·동네 (G3) → 친구 초대 화면 */
export function CrewNewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<CrewType | null>(null);
  const [name, setName] = useState('');
  const [sigunguId, setSigunguId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const regions = useAsync(getLocalRegions, []);

  // 내 동네들의 구 (같은 구는 한 번만)
  const sigungus = (regions.data?.items ?? []).filter(
    (r, i, all) => all.findIndex((x) => x.sigunguId === r.sigunguId) === i,
  );
  const picked = sigunguId ?? sigungus[0]?.sigunguId ?? null;
  const trimmed = name.trim();

  const submit = async () => {
    if (!type || picked === null) return;
    setBusy(true);
    try {
      const crew = await createCrew({ type, name: trimmed, sigunguId: picked });
      navigate(`/crews/${crew.crewId}/invite`, { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  };

  if (step === 1) {
    return (
      <Screen
        footer={
          <Button disabled={!type} onClick={() => setStep(2)}>
            다음
          </Button>
        }
      >
        <AppHeader title="모임 만들기" right={<span className={styles.step}>1 / 2</span>} />
        <div className={styles.content}>
          <div>
            <h2 className={styles.bigTitle}>누구와 함께해요?</h2>
            <p className={styles.lead}>
              모임원 모두 안 가 본 곳 중 모두가 만족할 만한 곳을 골라 줘요.
            </p>
          </div>
          <div className={styles.typeList} role="radiogroup" aria-label="모임 종류">
            {TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                role="radio"
                aria-checked={type === t.type}
                className={styles.typeCard}
                data-on={type === t.type}
                onClick={() => setType(t.type)}
              >
                <span className={styles.typeIcon} data-type={t.type}>
                  <CrewTypeIcon type={t.type} />
                </span>
                <span className={styles.typeBody}>
                  <span className={styles.typeName}>
                    {t.name}
                    <small>{t.size}</small>
                  </span>
                  <span className={styles.typeText}>{t.text}</span>
                </span>
              </button>
            ))}
          </div>
          <p className={styles.note}>
            <UsersIcon size={18} />
            모임은 여러 개 만들 수 있어요. 친구 모임, 가족 모임을 따로 두고 퀘스트도 따로 받아요.
          </p>
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          disabled={busy || trimmed.length < 2 || picked === null}
          onClick={() => void submit()}
        >
          모임 만들기
        </Button>
      }
    >
      <AppHeader
        title="모임 만들기"
        onBack={() => setStep(1)}
        right={<span className={styles.step}>2 / 2</span>}
      />
      <div className={styles.content}>
        <TextField
          label="모임 이름"
          value={name}
          onChange={(v) => setName(v.slice(0, NAME_MAX))}
          placeholder="예) 우리 과 동기"
          maxLength={NAME_MAX}
          right={
            <span className={styles.count}>
              {trimmed.length}/{NAME_MAX}
            </span>
          }
          hint="2~12자"
        />
        <div>
          <p className={styles.fieldLabel}>주로 정복할 동네</p>
          {regions.error ? (
            <p className={styles.fieldBox}>내 동네를 불러오지 못했어요</p>
          ) : sigungus.length === 0 ? (
            <p className={styles.fieldBox}>{regions.data ? '내 동네를 먼저 정해 주세요' : ' '}</p>
          ) : (
            <div className={styles.sigungus} role="radiogroup" aria-label="주로 정복할 동네">
              {sigungus.map((r) => (
                <button
                  key={r.sigunguId}
                  type="button"
                  role="radio"
                  aria-checked={picked === r.sigunguId}
                  data-on={picked === r.sigunguId}
                  className={styles.fieldBox}
                  onClick={() => setSigunguId(r.sigunguId)}
                >
                  {r.sigunguName}
                  <small>같은 구 안에서 추천</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className={styles.note} data-tone="blue">
          <LockIcon size={18} />
          모임원에게는 정복한 가게와 별점만 보여요. 언제 갔는지, 지금 어디 있는지는 공유되지 않아요.
        </p>
        <p className={styles.hint}>만들고 나면 링크·초대 코드·닉네임으로 모임원을 초대해요.</p>
      </div>
    </Screen>
  );
}
