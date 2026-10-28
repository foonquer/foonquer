import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './Button.module.css';

type Variant =
  | 'primary' // 초록 바탕 흰 글자
  | 'white' // 흰 바탕 진초록 글자
  | 'soft' // 연한 바탕 진초록 글자 (미리보기 시트 왼쪽 버튼)
  | 'gray' // 회색 바탕 회색 글자 (확인창 취소)
  | 'outline'; // 흰 바탕 초록 테두리

type Size = 'lg' | 'md' | 'sm';

type Common = {
  variant?: Variant;
  /** lg: 52px 둥글기 18 / md: 50px 둥글기 17 / sm: 48px 둥글기 14 */
  size?: Size;
  /** 가로를 꽉 채운다 (기본 true) */
  block?: boolean;
  children: ReactNode;
  className?: string;
};

type Props = Common & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = 'primary',
  size = 'lg',
  block = true,
  className,
  type = 'button',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`${styles.button} ${className ?? ''}`}
      data-variant={variant}
      data-size={size}
      data-block={block}
      {...rest}
    >
      {children}
    </button>
  );
}

type LinkProps = Common & { to: string; state?: unknown };

/** 버튼처럼 보이는 링크 (다른 화면으로 가기만 할 때) */
export function ButtonLink({
  variant = 'primary',
  size = 'lg',
  block = true,
  className,
  children,
  to,
  state,
}: LinkProps) {
  return (
    <Link
      to={to}
      state={state}
      className={`${styles.button} ${className ?? ''}`}
      data-variant={variant}
      data-size={size}
      data-block={block}
    >
      {children}
    </Link>
  );
}
