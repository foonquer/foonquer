import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  getCrewInvitation,
  joinCrewByCode,
  previewCrewByCode,
  respondCrewInvitation,
  type CrewHead,
  type CrewMember,
} from '../../api/crews';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Avatars, PrivacyRows } from './CrewParts';
import styles from './Crew.module.css';

type Invite = CrewHead & {
  members: CrewMember[];
  inviterNickname?: string | null;
  myStatus?: 'JOINED' | 'INVITED' | null;
};

/** 초대 카드 (피그마 G4): 모임원 · "지현님이 "우리 과 동기"에 초대했어요" · 칩 · 보이는 것 · 거절/참여하기 */
function InviteCard({
  invite,
  busy,
  onDecline,
  onAccept,
  declineLabel,
}: {
  invite: Invite;
  busy: boolean;
  onDecline: () => void;
  onAccept: () => void;
  declineLabel: string;
}) {
  return (
    <section className={styles.inviteCard} aria-label="모임 초대">
      <Avatars people={invite.members} meId={undefined} size="lg" />
      <h1 className={styles.inviteTitle}>
        {invite.inviterNickname
          ? `${invite.inviterNickname}님이 "${invite.name}"에 초대했어요`
          : `"${invite.name}" 모임에 들어갈까요?`}
      </h1>
      <p className={styles.chips}>
        <span data-tone="blue">{invite.typeName} 모임</span>
        <span>{invite.sigunguName}</span>
        <span>{invite.memberCount}명 참여 중</span>
      </p>
      <PrivacyRows />
      <div className={styles.actions}>
        <Button variant="white" onClick={onDecline} disabled={busy}>
          {declineLabel}
        </Button>
        <Button onClick={onAccept} disabled={busy}>
          참여하기
        </Button>
      </div>
    </section>
  );
}

/** 받은 초대 /crews/:crewId/invitation (알림·내 모임에서) */
export function CrewInvitationPage() {
  const crewId = Number(useParams().crewId);
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error } = useAsync(() => getCrewInvitation(crewId), [crewId]);
  const [busy, setBusy] = useState(false);

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await respondCrewInvitation(crewId, accept);
      if (accept) navigate(`/crews/${crewId}`, { replace: true });
      else {
        toast('초대를 거절했어요');
        navigate('/me/crews', { replace: true });
      }
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="모임 초대" />
      {error ? (
        <EmptyState
          title={errorMessage(error)}
          description="이미 참여했거나 거절한 초대일 수 있어요."
          action={{ label: '내 모임 보기', to: '/me/crews' }}
        />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={styles.inviteWrap}>
          <InviteCard
            invite={data}
            busy={busy}
            declineLabel="거절"
            onDecline={() => void respond(false)}
            onAccept={() => void respond(true)}
          />
        </div>
      )}
    </Screen>
  );
}

/** 초대 코드로 참여 /crews/join?code= (초대 링크·내 모임 "초대 코드로 참여") */
export function CrewJoinPage() {
  const [params, setParams] = useSearchParams();
  const code = (params.get('code') ?? '').trim().toUpperCase();
  const navigate = useNavigate();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useAsync(() => (code ? previewCrewByCode(code) : Promise.resolve(null)), [code]);

  const join = async () => {
    setBusy(true);
    try {
      const crew = await joinCrewByCode(code);
      navigate(`/crews/${crew.crewId}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  };

  if (!code || preview.error) {
    return (
      <Screen>
        <AppHeader title="초대 코드로 참여" />
        <form
          className={styles.content}
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) setParams({ code: input.trim().toUpperCase() }, { replace: true });
          }}
        >
          <TextField
            label="초대 코드"
            value={input}
            onChange={setInput}
            placeholder="예) MJK-4821"
            maxLength={10}
            status={preview.error ? 'error' : 'default'}
            message={preview.error ? errorMessage(preview.error) : undefined}
            autoCapitalize="characters"
          />
          <Button type="submit" disabled={!input.trim()}>
            확인
          </Button>
          <p className={styles.hint}>모임원에게 받은 초대 코드나 초대 링크로 들어갈 수 있어요.</p>
        </form>
      </Screen>
    );
  }

  const data = preview.data;
  return (
    <Screen>
      <AppHeader title="모임 초대" />
      {!data ? (
        <Loading />
      ) : data.myStatus === 'JOINED' ? (
        <EmptyState
          title={`이미 들어간 모임이에요 · ${data.name}`}
          action={{ label: '모임 공간 열기', to: `/crews/${data.crewId}` }}
        />
      ) : (
        <div className={styles.inviteWrap}>
          <InviteCard
            invite={data}
            busy={busy}
            declineLabel="닫기"
            onDecline={() => navigate('/', { replace: true })}
            onAccept={() => void join()}
          />
        </div>
      )}
    </Screen>
  );
}
