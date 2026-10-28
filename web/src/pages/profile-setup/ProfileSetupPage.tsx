import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Dong } from '../../api/regions';
import { completeProfile, type AgeGroup, type Gender, type Welcome } from '../../api/users';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { InfoStep } from './InfoStep';
import { NicknameStep } from './NicknameStep';
import { RegionStep } from './RegionStep';
import { WelcomeStep } from './WelcomeStep';

export type ProfileDraft = {
  nickname: string;
  gender: Gender | null;
  ageGroup: AgeGroup | null;
  regions: Dong[];
};

const STEPS = ['nickname', 'info', 'region'] as const;
type Step = (typeof STEPS)[number];

/**
 * 프로필 설정 S-04 닉네임 → S-05 성별·나이대 → S-06 내 동네 → (USER-03 저장) → S-07 가입 완료.
 * 단계는 주소(?step=)에 남겨 브라우저 뒤로 가기로 이전 단계로 갈 수 있게 한다.
 */
export function ProfileSetupPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const step: Step = STEPS.find((s) => s === params.get('step')) ?? 'nickname';
  const [draft, setDraft] = useState<ProfileDraft>({
    nickname: '',
    gender: null,
    ageGroup: null,
    regions: [],
  });
  const [welcome, setWelcome] = useState<{ welcome: Welcome; draft: ProfileDraft } | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const goTo = (next: Step) => setParams(next === 'nickname' ? {} : { step: next });

  // 새로 고침 등으로 앞 단계 값이 없으면 처음부터
  const reachable = (s: Step) =>
    s === 'nickname' ||
    (s === 'info' && !!draft.nickname) ||
    (s === 'region' && !!draft.nickname && !!draft.gender && !!draft.ageGroup);
  const current = reachable(step) ? step : 'nickname';

  const save = async () => {
    if (!draft.gender || !draft.ageGroup || draft.regions.length === 0) return;
    setSaving(true);
    try {
      const result = await completeProfile({
        nickname: draft.nickname,
        gender: draft.gender,
        ageGroup: draft.ageGroup,
        localRegionIds: draft.regions.map((r) => r.regionId),
      });
      // 아직 nextAction을 HOME으로 바꾸지 않는다 (바꾸면 라우트 가드가 바로 홈으로 보낸다).
      // S-07에서 "첫 맛집 찾으러 가기"를 누를 때 바꾼다.
      setWelcome({ welcome: result.welcome, draft });
    } catch (err) {
      toast(errorMessage(err));
      // 그사이 닉네임을 누가 가져갔으면 닉네임 단계로
      if (err instanceof ApiError && err.code === 'NICKNAME_DUPLICATE') goTo('nickname');
      setSaving(false);
    }
  };

  if (welcome) return <WelcomeStep welcome={welcome.welcome} draft={welcome.draft} />;

  switch (current) {
    case 'nickname':
      return (
        <NicknameStep
          nickname={draft.nickname}
          onNext={(nickname) => {
            update({ nickname });
            goTo('info');
          }}
        />
      );
    case 'info':
      return (
        <InfoStep
          gender={draft.gender}
          ageGroup={draft.ageGroup}
          onChange={update}
          onNext={() => goTo('region')}
        />
      );
    case 'region':
      return (
        <RegionStep
          regions={draft.regions}
          onChange={(regions) => update({ regions })}
          onSubmit={save}
          saving={saving}
        />
      );
  }
}
