import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getSavedRestaurants, type SavedTab } from '../../api/saved';
import { Button, ButtonLink } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyState, Loading } from '../../components/StateViews';
import { errorMessage } from '../../lib/api';
import { formatKoreanDate, joinDot } from '../../lib/format';
import { usePaged } from '../../lib/usePaged';
import styles from './List.module.css';

type Pin = { restaurantId: number; name: string; lat: number; lng: number; conquered: boolean };

/** 저장한 가게 위치를 판에 맞춰 늘어놓는다 (전국에 흩어져 있어도 모두 보이게) */
function PinBoard({
  pins,
  selectedId,
  onSelect,
}: {
  pins: Pin[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  // 한 곳뿐이거나 가까이 모여 있으면 너무 확대되지 않게 최소 범위를 둔다
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), 0.02);
  const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.02);
  const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const midLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;
  return (
    <div className={styles.board} role="group" aria-label="저장한 맛집 지도">
      {pins.map((p) => (
        <button
          key={p.restaurantId}
          type="button"
          className={styles.pin}
          data-conquered={p.conquered}
          aria-pressed={p.restaurantId === selectedId}
          style={{
            left: `${50 + ((p.lng - midLng) / spanLng) * 76}%`,
            top: `${50 - ((p.lat - midLat) / spanLat) * 70}%`,
          }}
          onClick={() => onSelect(p.restaurantId)}
        >
          <span aria-hidden="true">{p.conquered ? '★' : '☆'}</span>
          {p.name}
        </button>
      ))}
      <p className={styles.legend}>
        <span>☆ 가고 싶은 곳</span>
        <span>★ 정복한 곳</span>
      </p>
    </div>
  );
}

/** 맛집 리스트 탭 /list?tab=WANT|CONQUERED (LIST-01) */
export function ListPage() {
  const [params, setParams] = useSearchParams();
  const tab: SavedTab = params.get('tab') === 'CONQUERED' ? 'CONQUERED' : 'WANT';
  const list = usePaged((page) => getSavedRestaurants({ tab, page, size: 20 }), [tab]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const first = list.first;
  const selected = list.items.find((i) => i.restaurantId === selectedId);
  const pin = first?.pins.find((p) => p.restaurantId === selectedId);

  const header = (
    <div className={styles.head}>
      <h1 className={styles.title}>맛집 리스트</h1>
      <Link to="/list/add" className={styles.add}>
        ＋ 맛집 추가
      </Link>
    </div>
  );

  if (list.error && !first) {
    return (
      <Screen inTab>
        {header}
        <EmptyState title={errorMessage(list.error)} onRetry={list.reload} />
      </Screen>
    );
  }
  if (!first) {
    return (
      <Screen inTab>
        {header}
        <Loading />
      </Screen>
    );
  }

  const { summary } = first;
  if (summary.totalCount === 0) {
    return (
      <Screen inTab>
        {header}
        <div className={styles.content}>
          <h2 className={styles.lead}>다음에 갈 맛집을 모아보세요</h2>
          <p className={styles.leadSub}>가고 싶은 곳을 저장하면 지도에 모아드려요.</p>
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>생각난 맛집, 잊기 전에 저장</p>
            <p className={styles.emptyText}>
              가게 이름이나 동네를 검색해 추가하세요.
              <br />
              다음에 갈 곳을 지도에서 바로 찾을 수 있어요.
            </p>
            <ButtonLink to="/list/add" size="md">
              ＋ 첫 맛집 추가하기
            </ButtonLink>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen inTab>
      {header}
      <div className={styles.content}>
        <h2 className={styles.lead}>저장한 맛집, 이번엔 가볼까요?</h2>
        <p className={styles.leadSub}>
          모아둔 {summary.totalCount}곳 · 아직 안 가본 맛집 {summary.wantCount}곳
        </p>
        <PinBoard pins={first.pins} selectedId={selectedId} onSelect={setSelectedId} />
        {pin && (
          <section className={styles.info} aria-label={`${pin.name} 정보`}>
            <div className={styles.infoHead}>
              <p className={styles.infoName}>{pin.name}</p>
              <button type="button" onClick={() => setSelectedId(null)}>
                닫기
              </button>
            </div>
            {selected && (
              <p className={styles.infoMeta}>
                {joinDot([selected.categoryName, `${selected.regionLabel} ${selected.dongName}`])}
              </p>
            )}
            <p className={styles.infoText}>
              {pin.conquered
                ? '정복한 가게예요. 다시 가서 기록을 쌓아 보세요.'
                : selected
                  ? `${selected.savedDaysAgo === 0 ? '오늘' : `${selected.savedDaysAgo}일 전에`} 저장했어요. 이번에 들러볼까요?`
                  : '저장한 가게예요. 이번에 들러볼까요?'}
            </p>
            <ButtonLink to={`/restaurants/${pin.restaurantId}`} size="sm">
              음식점 상세 보기
            </ButtonLink>
          </section>
        )}

        <div className={styles.tabs} role="tablist" aria-label="저장한 맛집">
          {(
            [
              ['WANT', `가고 싶은 곳 ${summary.wantCount}`],
              ['CONQUERED', `정복한 곳 ${summary.conqueredCount}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setParams({ tab: value }, { replace: true })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.listHead}>
          <span>{tab === 'WANT' ? '다음에 갈 맛집' : '다녀온 맛집'}</span>
          <span>{tab === 'WANT' ? '오래 저장한 순' : '최근 정복한 순'}</span>
        </div>
        {list.items.length === 0 ? (
          <p className={styles.note}>
            {tab === 'WANT'
              ? '저장한 곳을 모두 정복했어요!'
              : '저장한 가게 중 정복한 곳이 아직 없어요.'}
          </p>
        ) : (
          <ul className={styles.rows}>
            {list.items.map((r) => (
              <li key={r.restaurantId}>
                <Link to={`/restaurants/${r.restaurantId}`} className={styles.row}>
                  <span
                    className={styles.rowIcon}
                    data-conquered={tab === 'CONQUERED'}
                    aria-hidden="true"
                  >
                    {tab === 'CONQUERED' ? '★' : '☆'}
                  </span>
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>
                      {r.name}
                      {r.isClosed && <span className={styles.closed}>폐업</span>}
                    </span>
                    <span className={styles.rowMeta}>
                      {joinDot([r.regionLabel, r.categoryName])}
                    </span>
                    {r.memo && <span className={styles.memo}>{r.memo}</span>}
                  </span>
                  <span className={styles.rowDate}>
                    {tab === 'CONQUERED'
                      ? `${formatKoreanDate(r.conqueredAt)} 정복`
                      : r.savedDaysAgo === 0
                        ? '오늘 저장'
                        : `${r.savedDaysAgo}일 전 저장`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.hasNext && (
          <Button variant="white" size="sm" onClick={list.loadMore} disabled={list.loading}>
            더 보기
          </Button>
        )}
        {tab === 'CONQUERED' && (
          <p className={styles.note}>정복한 가게는 지도에 채운 별로 남아요.</p>
        )}
      </div>
    </Screen>
  );
}
