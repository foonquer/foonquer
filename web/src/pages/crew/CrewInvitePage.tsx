import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { getCrew, inviteToCrew } from '../../api/crews';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/api';
import { inviteLinkOf, myIdOf } from '../../lib/crew';
import { useAsync } from '../../lib/useAsync';
import { LinkIcon, LockIcon, SearchIcon } from '../quest/QuestIcons';
import { Avatars } from './CrewParts';
import styles from './Crew.module.css';

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

/** 모임원 초대 /crews/:crewId/invite (피그마 G3 아래쪽): 링크 복사 · 초대 코드 · 닉네임 검색, 수락 대기 목록 */
export function CrewInvitePage() {
  const crewId = Number(useParams().crewId);
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => getCrew(crewId), [crewId]);
  const [searching, setSearching] = useState(false);
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);

  const copyText = (text: string, done: string) =>
    copy(text).then(
      () => toast({ message: done, check: true }),
      () => toast('복사하지 못했어요. 길게 눌러 직접 복사해 주세요'),
    );

  const invite = async () => {
    const name = nickname.trim();
    if (!name) return;
    setBusy(true);
    try {
      await inviteToCrew(crewId, name);
      toast({ message: `${name}님을 초대했어요`, check: true });
      setNickname('');
      reload();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const meId = data ? myIdOf(data.members) : undefined;
  const full = data ? data.members.length >= data.maxMembers : false;

  return (
    <Screen
      footer={
        data && (
          <Button onClick={() => navigate(`/crews/${crewId}`, { replace: true })}>
            모임 공간으로
          </Button>
        )
      }
    >
      <AppHeader title={data ? `${data.name} 초대` : '모임 초대'} />
      {error ? (
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={styles.content}>
          <p className={styles.fieldLabel}>
            {data.typeName} 초대{' '}
            <small>
              {data.members.length}/{data.maxMembers}명
            </small>
          </p>
          <div className={styles.inviteTiles}>
            <button
              type="button"
              onClick={() => void copyText(inviteLinkOf(data.inviteCode), '초대 링크를 복사했어요')}
            >
              <span>
                <LinkIcon />
              </span>
              링크 복사
            </button>
            <button
              type="button"
              onClick={() => void copyText(data.inviteCode, '초대 코드를 복사했어요')}
            >
              <span>
                <LockIcon />
              </span>
              초대 코드
              <small>{data.inviteCode}</small>
            </button>
            <button
              type="button"
              aria-expanded={searching}
              onClick={() => setSearching((v) => !v)}
              disabled={full}
            >
              <span>
                <SearchIcon />
              </span>
              닉네임 검색
            </button>
          </div>

          {searching && !full && (
            <form
              className={styles.inviteForm}
              onSubmit={(e) => {
                e.preventDefault();
                void invite();
              }}
            >
              <TextField
                label="초대할 닉네임"
                value={nickname}
                onChange={setNickname}
                placeholder="닉네임을 정확히 써 주세요"
                maxLength={10}
                autoFocus
              />
              <Button type="submit" size="sm" block={false} disabled={busy || !nickname.trim()}>
                초대
              </Button>
            </form>
          )}
          {full && <p className={styles.hint}>모임 인원이 다 찼어요 ({data.maxMembers}명)</p>}

          <ul className={styles.memberList} aria-label="모임원">
            {data.members.map((m) => (
              <li key={m.userId}>
                <Avatars people={[m]} meId={meId} size="md" />
                <span className={styles.memberName}>
                  {m.isMe ? `${m.nickname} (나)` : m.nickname}
                </span>
                <span className={styles.memberState} data-state={m.status}>
                  {m.status === 'INVITED' ? '수락 대기' : '참여 중'}
                </span>
              </li>
            ))}
          </ul>

          <p className={styles.note} data-tone="blue">
            <LockIcon size={18} />
            모임원에게는 정복한 가게와 별점만 보여요. 언제 갔는지, 지금 어디 있는지는 공유되지
            않아요.
          </p>
        </div>
      )}
    </Screen>
  );
}
