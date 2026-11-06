import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MyMukkaebi, ShopItem } from '../api/mukkaebi';
import { mockApi, ok } from './http';
import { renderRoute } from './render';

const mukkaebi = (patch: Partial<MyMukkaebi> = {}): MyMukkaebi => ({
  level: 7,
  exp: 330,
  levelExp: 300,
  nextLevelExp: 400,
  stage: 'BABY',
  stageName: '아기',
  sizePercent: 60,
  equipped: {
    hat: { itemId: 2, code: 'HAT_STRAWBERRY', name: '딸기 모자', rarity: 'N' },
    face: null,
    prop: null,
    skin: null,
    club: null,
  },
  background: null,
  currentRestaurant: null,
  pointBalance: 1280,
  newItemCount: 0,
  unopenedBoxCount: 0,
  ...patch,
});

const shopItem = (patch: Partial<ShopItem>): ShopItem => ({
  itemId: 3,
  code: 'HAT_CHICK',
  name: '병아리 모자',
  description: '삐약삐약 병아리 모자예요.',
  category: 'HAT',
  rarity: 'N',
  price: 450,
  badge: null,
  purchasable: true,
  owned: false,
  equipped: false,
  unlockCondition: null,
  requiredAchievement: null,
  ...patch,
});

const owned = (itemId: number, name: string, isEquipped = false) => ({
  itemId,
  code: `HAT_${itemId}`,
  name,
  category: 'HAT',
  rarity: 'N',
  quantity: 1,
  isNew: false,
  isEquipped,
  acquiredAt: '2026-09-01T00:00:00+09:00',
});

describe('먹깨비 꾸미기', () => {
  it('가진 모자로 입어 보고 바뀐 칸만 저장한다', async () => {
    const server = mockApi({
      'GET /characters/me': ok(mukkaebi()),
      'GET /characters/me/items': ok({
        items: [owned(2, '딸기 모자', true), owned(5, '곰돌이 모자')],
        backgrounds: [],
      }),
      'PUT /characters/me/appearance': ok({ equipped: {}, background: null }),
    });
    const { router } = renderRoute('/me/mukkaebi/decorate');

    const save = await screen.findByRole('button', { name: '저장하기' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /곰돌이 모자/ }));
    expect(screen.getByText('변경 사항 1개 · 가진 아이템이라 바로 저장돼요')).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(router.state.location.pathname).toBe('/me/mukkaebi'));
    expect(server.calls('PUT /characters/me/appearance')[0].body).toEqual({ hatItemId: 5 });
  });
});

describe('상점', () => {
  it('구매 확인 → 구매 → 바로 착용하기', async () => {
    const server = mockApi({
      'GET /shop/items': ok({
        category: 'HAT',
        pointBalance: 1280,
        sets: [],
        items: [shopItem({})],
      }),
      'POST /shop/purchases': ok({
        itemId: 3,
        name: '병아리 모자',
        price: 450,
        pointBalance: 830,
        equipped: false,
      }),
      'PUT /characters/me/appearance': ok({ equipped: {}, background: null }),
      'GET /characters/me': ok(mukkaebi()),
      'GET /characters/me/collection': ok({
        collectedCount: 0,
        totalCount: 0,
        stages: [],
        items: [],
        backgrounds: [],
        nextGoal: null,
      }),
    });
    const { router } = renderRoute('/me/mukkaebi/shop');

    fireEvent.click(await screen.findByRole('button', { name: /병아리 모자/ }));
    const sheet = screen.getByRole('dialog', { name: '병아리 모자' });
    expect(sheet).toHaveTextContent('1,280P → 830P');
    fireEvent.click(within(sheet).getByRole('button', { name: '450P로 구매하기' }));

    const done = await screen.findByRole('dialog', { name: '구매 완료' });
    expect(done).toHaveTextContent('병아리 모자를 샀어요!');
    expect(done).toHaveTextContent('남은 먹포인트는 830P예요.');
    expect(server.calls('POST /shop/purchases')[0].body).toEqual({ itemId: 3, equipNow: false });
    fireEvent.click(within(done).getByRole('button', { name: '바로 착용하기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/me/mukkaebi'));
    expect(server.calls('PUT /characters/me/appearance')[0].body).toEqual({ hatItemId: 3 });
  });

  it('탭을 바꾸는 동안에도 탭 줄과 세트 배너는 그대로 있다', async () => {
    mockApi({
      'GET /shop/items': ({ query }) =>
        ok({
          category: query.get('category'),
          pointBalance: 1280,
          sets: [
            {
              setId: 1,
              code: 'SET_STRAWBERRY',
              name: '딸기 세트',
              description: '모자와 소품',
              badge: null,
              price: 800,
              originalPrice: 1000,
              purchasable: true,
              items: [],
            },
          ],
          items: [shopItem({})],
        }),
    });
    renderRoute('/me/mukkaebi/shop');
    await screen.findByRole('button', { name: /병아리 모자/ });
    fireEvent.click(screen.getByRole('tab', { name: '얼굴' }));
    expect(screen.getByRole('tab', { name: '얼굴' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /딸기 세트/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /병아리 모자/ })).toBeInTheDocument();
  });

  it('먹포인트가 모자라면 부족한 만큼 알려 준다', async () => {
    mockApi({
      'GET /shop/items': ok({
        category: 'HAT',
        pointBalance: 250,
        sets: [],
        items: [shopItem({ price: 300, name: '딸기 모자', itemId: 2 })],
      }),
    });
    renderRoute('/me/mukkaebi/shop');
    fireEvent.click(await screen.findByRole('button', { name: /딸기 모자/ }));
    const sheet = screen.getByRole('dialog', { name: '딸기 모자' });
    expect(sheet).toHaveTextContent('50P 부족');
    expect(sheet).toHaveTextContent('글 리뷰 2개면 모을 수 있어요!');
    expect(within(sheet).getByRole('button', { name: '포인트 모으러 가기' })).toBeInTheDocument();
  });
});

describe('아이템 상자·축하·먹포인트', () => {
  it('아이템 상자를 열면 나온 아이템을 보여 준다', async () => {
    const server = mockApi({
      'GET /characters/me/item-boxes': ok({
        unopenedCount: 1,
        items: [
          {
            boxId: 7,
            title: 'LV.10 성장 보상',
            opened: false,
            receivedAt: '2026-09-25T12:00:00+09:00',
            openedAt: null,
            resultItem: null,
            resultPoint: null,
          },
        ],
      }),
      'POST /characters/me/item-boxes/:id/open': ok({
        boxId: 7,
        item: {
          itemId: 5,
          code: 'HAT_BEAR',
          name: '곰돌이 모자',
          category: 'HAT',
          rarity: 'R',
          price: 400,
        },
        point: null,
        unopenedCount: 0,
      }),
    });
    renderRoute('/me/mukkaebi/boxes');
    fireEvent.click(await screen.findByRole('button', { name: '열기' }));
    expect(screen.getByText('아이템 상자를 열어 볼까요?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '상자 열기' }));
    expect(await screen.findByText('곰돌이 모자를 얻었어요!')).toBeInTheDocument();
    expect(screen.getByText(/상점에서 400P인 아이템이에요/)).toBeInTheDocument();
    expect(server.calls('POST /characters/me/item-boxes/:id/open')[0].path).toBe(
      '/characters/me/item-boxes/7/open',
    );
  });

  it('홈에 들어오면 보지 않은 레벨 업 축하를 띄우고, 닫으면 확인 처리한다', async () => {
    const server = mockApi({
      'GET /users/me/celebrations': ok({
        items: [
          {
            celebrationId: 'LEVEL_UP:10',
            type: 'LEVEL_UP',
            occurredAt: '2026-09-25T12:00:00+09:00',
            data: { fromLevel: 9, toLevel: 10, stage: 'KID', stageName: '어린이', itemBoxCount: 1 },
          },
          {
            celebrationId: 'LEVEL_UP:11',
            type: 'LEVEL_UP',
            occurredAt: '2026-09-26T12:00:00+09:00',
            data: {
              fromLevel: 10,
              toLevel: 11,
              stage: 'KID',
              stageName: '어린이',
              itemBoxCount: 0,
            },
          },
        ],
      }),
      'PATCH /users/me/celebrations/:id/seen': ok({ seen: true }),
    });
    renderRoute('/');
    const dialog = await screen.findByRole('dialog', { name: 'LV.9 → LV.10' });
    expect(dialog).toHaveTextContent('먹깨비가 어린이로 자랐어요!');
    expect(dialog).toHaveTextContent('성장 보상 · 아이템 상자 1개');
    fireEvent.click(within(dialog).getByRole('button', { name: '나중에 할게요' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'LV.9 → LV.10' })).not.toBeInTheDocument(),
    );
    expect(server.calls('PATCH /users/me/celebrations/:id/seen')[0].path).toBe(
      '/users/me/celebrations/LEVEL_UP%3A10/seen',
    );

    // 다음 축하는 Escape로도 닫는다
    const next = await screen.findByRole('dialog', { name: 'LV.10 → LV.11' });
    fireEvent.keyDown(within(next).getByRole('button', { name: '나중에 할게요' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(server.calls('PATCH /users/me/celebrations/:id/seen')).toHaveLength(2);
  });

  it('축하는 홈이 아닌 탭 화면에서도 뜨고, 누르면 그 화면으로 간다', async () => {
    mockApi({
      'GET /users/me/celebrations': ok({
        items: [
          {
            celebrationId: 'BACKGROUND:3',
            type: 'BACKGROUND',
            occurredAt: '2026-09-25T12:00:00+09:00',
            data: { sigunguId: 3, sigunguName: '강서구', bgKey: null },
          },
        ],
      }),
      'PATCH /users/me/celebrations/:id/seen': ok({ seen: true }),
    });
    const { router } = renderRoute('/list');
    const dialog = await screen.findByRole('dialog', { name: '강서구 배경을 얻었어요!' });
    fireEvent.click(within(dialog).getByRole('button', { name: '배경 바꾸러 가기' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/me/mukkaebi/decorate'));
  });

  it('먹포인트 내역을 날짜별로 묶고 모은/쓴 내역으로 거른다', async () => {
    const server = mockApi({
      'GET /points/me': ok({ pointBalance: 1280, monthEarned: 410, monthSpent: 300 }),
      'GET /points/me/history': ok({
        items: [
          {
            pointHistoryId: 2,
            amount: 50,
            balanceAfter: 1280,
            reason: 'VISIT_VERIFIED',
            title: '새맛집 방문 인증',
            date: '2026-09-25',
            regDate: '',
          },
          {
            pointHistoryId: 1,
            amount: -300,
            balanceAfter: 1230,
            reason: 'PURCHASE',
            title: '딸기 모자 구매',
            date: '2026-09-24',
            regDate: '',
          },
        ],
        page: 1,
        size: 30,
        totalCount: 2,
        hasNext: false,
      }),
    });
    renderRoute('/me/points');
    expect(await screen.findByText('1,280P')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: '9월 25일' })).getByText('+50P'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: '9월 24일' })).getByText('−300P'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '쓴 내역' }));
    await waitFor(() =>
      expect(server.calls('GET /points/me/history').at(-1)?.query.get('type')).toBe('SPEND'),
    );
  });
});
