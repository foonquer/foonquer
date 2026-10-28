import { useEffect, useState } from 'react';
import { findDongHere, searchDongs, type Dong } from '../api/regions';
import currentLocation from '../assets/icons/current-location.svg';
import searchIcon from '../assets/icons/search-18.svg';
import searchMuted from '../assets/icons/search-18-muted.svg';
import selectedCheck from '../assets/icons/selected-check.svg';
import mukkaebi from '../assets/illust/mukkaebi.svg';
import seoulDongs from '../data/seoul-dongs.json';
import { errorMessage } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useToast } from './Toast';
import styles from './DongFinder.module.css';

/** 검색어를 다 쓰고 이만큼 멈추면 찾는다 (ms) */
const SEARCH_DELAY_MS = 250;
const SUGGESTIONS = ['가양동', '망원동', '성수동'];
const GU_NAMES = Object.keys(seoulDongs as Record<string, string[]>);

type Props = {
  /** 고른 동네 (여러 곳 고를 때 표시) */
  selectedIds: number[];
  /** 동네를 누르거나 현재 위치로 찾았을 때 */
  onSelect: (dong: Dong) => void;
  /** search: 동 이름 검색 / picker: 구·동 목록에서 직접 고르기 (위치 권한이 꺼졌을 때) */
  mode?: 'search' | 'picker';
  /** 위치 권한이 막혀 있을 때 (없으면 안내 토스트) */
  onLocationDenied?: () => void;
};

/** 내 동네·지역 선택에서 쓰는 동 찾기: 검색창 + 현재 위치로 찾기 + 결과 목록 */
export function DongFinder({ selectedIds, onSelect, mode = 'search', onLocationDenied }: Props) {
  const toast = useToast();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);

  // 검색어를 쓰다 멈추면 그때 찾는다
  useEffect(() => {
    const timer = setTimeout(() => setQuery(keyword.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [keyword]);

  const findHere = async () => {
    setLocating(true);
    try {
      const dong = await findDongHere();
      setKeyword(dong.dongName);
      // 이미 고른 동네면 그대로 둔다 (다시 누르면 빠지는 목록과 달리)
      if (!selectedIds.includes(dong.regionId)) onSelect(dong);
    } catch (err) {
      if (err === 'DENIED') {
        if (onLocationDenied) onLocationDenied();
        else toast('위치 권한이 꺼져 있어요. 동 이름으로 찾아 주세요.');
      } else if (err === 'UNAVAILABLE') {
        toast('지금 위치를 찾지 못했어요. 동 이름으로 찾아 주세요.');
      } else {
        toast(errorMessage(err));
      }
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className={styles.finder}>
      {mode === 'search' && (
        <label className={styles.searchBox} data-active={keyword.length > 0}>
          <img src={keyword ? searchIcon : searchMuted} alt="" width={18} height={18} />
          <input
            className={styles.searchInput}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="동 이름으로 검색 (예: 가양동)"
            maxLength={20}
            aria-label="동 이름 검색"
          />
          {keyword && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setKeyword('')}
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </label>
      )}

      <button type="button" className={styles.here} onClick={findHere} disabled={locating}>
        <img src={currentLocation} alt="" width={16} height={16} />
        {locating ? '위치 찾는 중…' : '현재 위치로 찾기'}
      </button>

      {mode === 'picker' ? (
        <DongPicker selectedIds={selectedIds} onSelect={onSelect} />
      ) : query ? (
        <DongResults keyword={query} selectedIds={selectedIds} onSelect={onSelect} />
      ) : (
        <div className={styles.panel} data-empty="true">
          <img src={mukkaebi} alt="" className={styles.mukkaebi} />
          <p className={styles.emptyText}>동 이름을 입력하면 바로 찾아드려요</p>
          <div className={styles.suggestions}>
            {SUGGESTIONS.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.chip}
                onClick={() => setKeyword(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 검색 결과 이름에서 검색어 부분을 초록색으로 */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const index = keyword ? text.indexOf(keyword) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className={styles.mark}>{keyword}</mark>
      {text.slice(index + keyword.length)}
    </>
  );
}

type ResultsProps = { keyword: string; selectedIds: number[]; onSelect: (dong: Dong) => void };

/** REGION-01 결과 목록 */
function DongResults({ keyword, selectedIds, onSelect }: ResultsProps) {
  const { data, error } = useAsync(() => searchDongs(keyword, 50), [keyword]);
  const words = keyword.split(/\s+/);

  return (
    <div className={styles.panel}>
      <p className={styles.count}>
        '{keyword}' 검색 결과 <span>{data?.totalCount ?? 0}</span>
      </p>
      {error ? (
        <p className={styles.notice}>{errorMessage(error)}</p>
      ) : data && data.items.length === 0 ? (
        <p className={styles.notice}>찾는 동네가 없어요. 서울의 동 이름으로 찾아 주세요.</p>
      ) : (
        <ul className={styles.list}>
          {data?.items.map((dong) => {
            const selected = selectedIds.includes(dong.regionId);
            return (
              <li key={dong.regionId}>
                <button
                  type="button"
                  className={styles.row}
                  aria-pressed={selected}
                  onClick={() => onSelect(dong)}
                >
                  <span className={styles.rowText}>
                    <span className={styles.dongName}>
                      {selected ? (
                        dong.dongName
                      ) : (
                        <Highlight text={dong.dongName} keyword={words.at(-1) ?? ''} />
                      )}
                    </span>
                    <span className={styles.guName}>서울 {dong.sigunguName}</span>
                  </span>
                  {selected && <img src={selectedCheck} alt="" width={12} height={9} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 구·동 목록에서 직접 고르기. 목록은 web/src/data/seoul-dongs.json(서버 지역 데이터와 같은 467개 법정동)이고,
 * 고르면 REGION-01로 "구 동" 이름을 찾아 regionId를 얻는다.
 */
function DongPicker({ selectedIds, onSelect }: Omit<ResultsProps, 'keyword'>) {
  const toast = useToast();
  const [gu, setGu] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [found, setFound] = useState<Record<string, number>>({});
  const dongs = gu ? (seoulDongs as Record<string, string[]>)[gu] : [];

  const pick = async (dongName: string) => {
    if (!gu || pending) return;
    setPending(dongName);
    try {
      const result = await searchDongs(`${gu} ${dongName}`, 5);
      const dong = result.items.find((d) => d.sigunguName === gu && d.dongName === dongName);
      if (!dong) throw new Error('not found');
      setFound((prev) => ({ ...prev, [`${gu} ${dongName}`]: dong.regionId }));
      onSelect(dong);
    } catch (err) {
      toast(
        err instanceof Error && err.message === 'not found'
          ? '동네를 찾지 못했어요.'
          : errorMessage(err),
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={styles.picker}>
      <ul className={styles.guList} aria-label="구">
        {GU_NAMES.map((name) => (
          <li key={name}>
            <button
              type="button"
              className={styles.guRow}
              aria-pressed={gu === name}
              onClick={() => setGu(name)}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
      {gu ? (
        <ul className={styles.dongList} aria-label={`${gu} 동`}>
          {dongs.map((name) => {
            const id = found[`${gu} ${name}`];
            const selected = id !== undefined && selectedIds.includes(id);
            return (
              <li key={name}>
                <button
                  type="button"
                  className={styles.dongRow}
                  aria-pressed={selected}
                  disabled={pending !== null}
                  onClick={() => pick(name)}
                >
                  {name}
                  {selected && <img src={selectedCheck} alt="" width={12} height={9} />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.pickerEmpty}>
          <img src={mukkaebi} alt="" className={styles.mukkaebi} />
          <p>왼쪽에서 구를 골라 주세요</p>
        </div>
      )}
    </div>
  );
}
