import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FoodImage } from '../components/FoodImage';
import { foodArtOf } from '../lib/foodArt';

const imgOf = (container: HTMLElement) => container.querySelector('img') as HTMLImageElement;

describe('가게 사진 자리 (FoodImage)', () => {
  it('리뷰 사진이 있으면 사진, 없으면 음식 종류 그림과 바탕색', () => {
    const photo = render(
      <FoodImage imageUrl="https://img.test/review/a.jpg" categoryName="치킨" />,
    );
    expect(imgOf(photo.container)).toHaveAttribute('src', 'https://img.test/review/a.jpg');

    const art = render(<FoodImage imageUrl={null} categoryName="치킨" />);
    expect(imgOf(art.container)).toHaveAttribute('src', foodArtOf('치킨').src);
    expect(foodArtOf('치킨').src).not.toBe(foodArtOf('한식').src);
    expect((art.container.firstChild as HTMLElement).style.background).not.toBe('');

    const unknown = render(<FoodImage categoryName="기타" />);
    expect(imgOf(unknown.container)).toHaveAttribute('src', foodArtOf(null).src);
  });

  it('사진을 못 불러오면 그림으로 바꾼다', () => {
    const { container } = render(
      <FoodImage imageUrl="https://img.test/review/broken.jpg" categoryName="카페·디저트" />,
    );
    fireEvent.error(imgOf(container));
    expect(imgOf(container)).toHaveAttribute('src', foodArtOf('카페·디저트').src);
  });
});
