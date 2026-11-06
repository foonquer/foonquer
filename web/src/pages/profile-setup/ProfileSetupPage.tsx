import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Dong } from '../../api/regions';
import {
  completeProfile,
  type AgeGroup,
  type Gender,
  type TasteWeights,
  type Welcome,
} from '../../api/users';
import { useToast } from '../../components/Toast';
import { ApiError, errorMessage } from '../../lib/api';
import { getSession, setNextAction, subscribeSession } from '../../lib/session';
import { DEFAULT_TASTE_WEIGHTS } from '../../lib/taste';
import { FoodStep } from './FoodStep';
import { InfoStep } from './InfoStep';
import { NicknameStep } from './NicknameStep';
import { RegionStep } from './RegionStep';
import { TasteStep } from './TasteStep';
import { WelcomeStep } from './WelcomeStep';

export type ProfileDraft = {
  nickname: string;
  gender: Gender | null;
  ageGroup: AgeGroup | null;
  /** S-05-1 좋아하는 음식 (카테고리 id) */
  foods: number[];
  /** S-05-2 중요하게 보는 것 (기본: 모두 보통) */
  taste: TasteWeights;
  regions: Dong[];
};

const STEPS = ['nickname', 'info', 'food', 'taste', 'region'] as const;
type Step = (typeof STEPS)[number];

type Completed = { welcome: Welcome; draft: ProfileDraft };

/**
 * 저장을 마친 S-07 내용. 다른 화면에 갔다 돌아와도 같은 완료 화면을 보여 준다 (이 탭 메모리에만).
 * 홈으로 넘어가거나(nextAction이 바뀜) 로그아웃하면 지운다.
 */
let completed: Completed | null = null;
subscribeSession(() => {
  const session = getSession();
  if (session.status !== 'authed' || session.nextAction !== 'PROFILE_REQUIRED') completed = null;
});

/**
 * 프로필 설정 S-04 닉네임 → S-05 성별·나이대 → S-05-1 좋아하는 음식 → S-05-2 중요하게 보는 것 → S-06 내 동네
 * → (USER-03 저장) → S-07 가입 완료.
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
    foods: [],
    taste: DEFAULT_TASTE_WEIGHTS,
    regions: [],
  });
  const [welcome, setWelcome] = useState<Completed | null>(() => completed);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const goTo = (next: Step) => setParams(next === 'nickname' ? {} : { step: next });

  // 새로 고침 등으로 앞 단계 값이 없으면 처음부터
  const reachable = (s: Step) =>
    s === 'nickname' ||
    (s === 'info' && !!draft.nickname) ||
    (s === 'food' && !!draft.nickname && !!draft.gender && !!draft.ageGroup) ||
    ((s === 'taste' || s === 'region') &&
      !!draft.nickname &&
      !!draft.gender &&
      !!draft.ageGroup &&
      draft.foods.length > 0);
  const current = reachable(step) ? step : 'nickname';

  const save = async () => {
    if (!draft.gender || !draft.ageGroup || draft.foods.length === 0 || draft.regions.length === 0)
      return;
    setSaving(true);
    try {
      const result = await completeProfile({
        nickname: draft.nickname,
        gender: draft.gender,
        ageGroup: draft.ageGroup,
        localRegionIds: draft.regions.map((r) => r.regionId),
        preferredCategoryIds: draft.foods,
        tasteWeights: draft.taste,
      });
      // 아직 nextAction을 HOME으로 바꾸지 않는다 (바꾸면 라우트 가드가 바로 홈으로 보낸다).
      // S-07에서 "첫 맛집 찾으러 가기"를 누를 때 바꾼다.
      completed = { welcome: result.welcome, draft };
      setWelcome(completed);
    } catch (err) {
      // 이미 완료한 회원 (다른 탭에서 마쳤거나 완료 화면 내용을 잃었을 때)은 홈으로
      if (err instanceof ApiError && err.code === 'PROFILE_ALREADY_COMPLETED') {
        setNextAction('HOME');
        return;
      }
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
          onNext={() => goTo('food')}
        />
      );
    case 'food':
      return (
        <FoodStep
          categoryIds={draft.foods}
          onChange={(foods) => update({ foods })}
          onNext={() => goTo('taste')}
        />
      );
    case 'taste':
      return (
        <TasteStep
          weights={draft.taste}
          onChange={(taste) => update({ taste })}
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
