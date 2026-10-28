import { useState, type FormEvent } from 'react';
import searchIcon from '../../assets/icons/search.svg';
import styles from './Search.module.css';

/** 서버 SEARCH-02 검색어 최대 길이 */
const KEYWORD_MAX = 30;

type Props = { initial?: string; onSubmit: (keyword: string) => void };

/** 음식점·메뉴 검색창 (엔터로 찾는다) */
export function SearchBar({ initial = '', onSubmit }: Props) {
  const [value, setValue] = useState(initial);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const keyword = value.trim();
    if (keyword) onSubmit(keyword);
  };

  return (
    <form className={styles.searchBar} onSubmit={submit} role="search">
      <img src={searchIcon} alt="" width={16} height={16} />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="음식점·메뉴 검색"
        maxLength={KEYWORD_MAX}
        aria-label="음식점·메뉴 검색"
      />
    </form>
  );
}
