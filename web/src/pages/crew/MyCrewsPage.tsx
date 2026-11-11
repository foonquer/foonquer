import { Link } from 'react-router';
import { getMyCrews } from '../../api/crews';
import { AppHeader } from '../../components/AppHeader';
import { ButtonLink } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { avatarColor, myIdOf } from '../../lib/crew';
import { useAsync } from '../../lib/useAsync';
import { LockIcon, PlusIcon } from '../quest/QuestIcons';
import { Avatars, CrewTypeIcon } from './CrewParts';
import styles from './Crew.module.css';

/** 내 정보 → 내 모임 /me/crews (피그마 M1, CREW-02): 참여 중인 모임, 새 모임·코드로 참여, 받은 초대 */
export function MyCrewsPage() {
  const { data, error, reload } = useAsync(getMyCrews, []);
  return (
    <Screen>
      <AppHeader title="내 모임" />
      {error ? (
        <EmptyState title={errorMessage(error)} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={styles.content}>
          {data.crews.length === 0 && (
            <p className={styles.panelEmpty}>
              친구·가족·연인과 모임을 만들면 같이 정복하는 모임 퀘스트를 받아요.
            </p>
          )}
          {data.crews.map((c) => (
            <Link key={c.crewId} to={`/crews/${c.crewId}`} className={styles.crewCard}>
              <span className={styles.typeIcon} data-type={c.type}>
                <CrewTypeIcon type={c.type} />
              </span>
              <span className={styles.crewBody}>
                <span className={styles.crewName}>
                  {c.name}
                  <span className={styles.typeChip} data-type={c.type}>
                    {c.typeName}
                  </span>
                </span>
                <small>
                  {c.memberCount}명 · {c.sigunguName} · 함께 정복 {c.conquestCount}곳
                </small>
                <span className={styles.crewFoot}>
                  <Avatars people={c.members} meId={myIdOf(c.members)} />
                  {c.activeQuestCount > 0 && (
                    <span className={styles.questChip}>이번 주 퀘스트 {c.activeQuestCount}개</span>
                  )}
                </span>
              </span>
              <span className={styles.chevron} aria-hidden="true">
                ›
              </span>
            </Link>
          ))}

          <div className={styles.actions}>
            <ButtonLink to="/crews/new" variant="white" size="sm">
              <PlusIcon /> 새 모임 만들기
            </ButtonLink>
            <ButtonLink to="/crews/join" variant="white" size="sm">
              <LockIcon size={18} /> 초대 코드로 참여
            </ButtonLink>
          </div>

          {data.invitations.length > 0 && (
            <section className={styles.invitations} aria-label="받은 초대">
              {data.invitations.map((inv, i) => (
                <Link key={inv.crewId} to={`/crews/${inv.crewId}/invitation`}>
                  <span
                    className={styles.inviteAvatar}
                    style={{ background: avatarColor(inv.crewId) }}
                    aria-hidden="true"
                  >
                    {Array.from(inv.inviterNickname ?? inv.name)[0]}
                  </span>
                  <span className={styles.rowBody}>
                    {i === 0 && <strong>받은 초대 {data.invitations.length}개</strong>}
                    <small>
                      {inv.inviterNickname ? `${inv.inviterNickname} · ` : ''}"{inv.name}"{' '}
                      {inv.typeName} 모임
                    </small>
                  </span>
                  <span className={styles.headLink}>보기</span>
                </Link>
              ))}
            </section>
          )}

          <p className={styles.hint}>
            모임은 여러 개 들어갈 수 있어요. 모임마다 퀘스트와 함께 정복 기록이 따로 쌓여요.
          </p>
        </div>
      )}
    </Screen>
  );
}
