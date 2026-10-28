// 키보드·화면 읽기 프로그램 사용자를 위한 공통 동작

import { useEffect, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 모달(시트·확인창)이 열리면 포커스를 안으로 옮기고, Tab이 밖으로 나가지 않게 가두고,
 * 닫히면 열기 전에 포커스가 있던 곳으로 돌려준다.
 */
export function useModalFocus(open: boolean, container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const box = container.current;
    if (!box) return;
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () => [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    // 첫 입력칸·버튼으로, 없으면 모달 자체로
    (focusables()[0] ?? box).focus();

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first || !box.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || !box.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, container]);
}

/**
 * role="radio" 버튼 묶음의 방향키 동작 (← ↑ 이전, → ↓ 다음, Home·End 처음·끝).
 * 고른 항목만 Tab으로 들어오고(roving tabindex), 방향키로 옮기면 바로 고른다.
 */
export function radioGroupKeyDown<T>(
  e: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T | null,
  onChange: (value: T) => void,
) {
  const buttons = e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
  // 아직 아무것도 안 골랐으면 지금 포커스가 있는 칸에서 출발한다
  const focused = Array.from(buttons).findIndex((b) => b === document.activeElement);
  const index = current === null ? focused : values.indexOf(current);
  let next: number | null = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % values.length;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
    next = (index - 1 + values.length) % values.length;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = values.length - 1;
  if (next === null) return;
  e.preventDefault();
  onChange(values[next]);
  buttons[next]?.focus();
}

/** roving tabindex: 고른 항목(없으면 첫 항목)만 Tab 정지점 */
export function radioTabIndex<T>(value: T, current: T | null, first: T) {
  return value === current || (current === null && value === first) ? 0 : -1;
}
