import type { CSSProperties } from 'react';

type Props = {
  /** import한 svg 주소 */
  src: string;
  /** 아이콘 상자 크기 (px) */
  size: number;
  /** 그림 크기 (px). 상자보다 작으면 가운데에 놓는다. 없으면 상자 크기 */
  width?: number;
  height?: number;
  className?: string;
};

/**
 * 글자색(currentColor)으로 칠하는 아이콘. 같은 아이콘을 선택·비선택 색으로 쓸 때 (하단 탭).
 * 색이 정해진 그림은 <img>를 쓴다.
 */
export function Icon({ src, size, width = size, height = size, className }: Props) {
  const style: CSSProperties = {
    display: 'inline-block',
    flexShrink: 0,
    width: size,
    height: size,
    backgroundColor: 'currentColor',
    mask: `url("${src}") center / ${width}px ${height}px no-repeat`,
    WebkitMask: `url("${src}") center / ${width}px ${height}px no-repeat`,
  };
  return <span className={className} style={style} aria-hidden="true" />;
}
