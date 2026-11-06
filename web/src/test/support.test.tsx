import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  size: 20,
  totalCount: items.length,
  hasNext: false,
});
/** 알림 시각을 고정한다 ("방금"이 테스트가 느려도 "1분 전"이 되지 않게) */
const NOW = '2026-11-06T12:00:00+09:00';
const fixNow = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
};
afterEach(() => vi.useRealTimers());

const rankNotification = {
  notificationId: 3,
  category: 'RANK',
  type: 'RANK_UP',
  title: '강서구 7위로 올랐어요!',
  content: '먹짱까지 10곳 남았어요',
  isRead: false,
  deepLink: '/ranking?sigunguId=1',
  regDate: NOW,
};

describe('알림함', () => {
  it('누르면 읽음 처리하고 그 화면으로 간다', async () => {
    fixNow();
    mockApi({
      'GET /notifications': ok({ unreadCount: 1, ...page([rankNotification]) }),
      'PATCH /notifications/:id/read': ok({
        notificationId: 3,
        isRead: true,
        deepLink: '/ranking?sigunguId=1',
      }),
    });
    const { router } = renderRoute('/notifications');

    const today = await screen.findByRole('region', { name: '오늘' });
    expect(within(today).getByText('먹짱까지 10곳 남았어요 · 방금')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /강서구 7위로 올랐어요!.*방금/ }));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/ranking?sigunguId=1',
      ),
    );
  });

  it('종류별로 거르고, 모두 읽음·지우기는 목록을 다시 부르지 않고 그 자리에서 고친다', async () => {
    fixNow();
    const server = mockApi({
      'GET /notifications': ok({ unreadCount: 1, ...page([rankNotification]) }),
      'PATCH /notifications/read-all': ok({}),
      'DELETE /notifications/:id': ok({}),
    });
    renderRoute('/notifications');

    await screen.findByRole('region', { name: '오늘' });
    fireEvent.click(screen.getByRole('radio', { name: '정복·순위' }));
    await waitFor(() =>
      expect(server.calls('GET /notifications').at(-1)?.query.get('category')).toBe('RANK'),
    );
    await screen.findByLabelText('안 읽음');
    const loads = server.calls('GET /notifications').length;

    fireEvent.click(screen.getByRole('button', { name: '모두 읽음' }));
    await waitFor(() => expect(screen.queryByLabelText('안 읽음')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '모두 읽음' })).toBeDisabled();
    expect(server.calls('PATCH /notifications/read-all')[0].body).toEqual({ category: 'RANK' });

    fireEvent.click(screen.getByRole('button', { name: '강서구 7위로 올랐어요! 지우기' }));
    expect(await screen.findByText('새 알림이 없어요')).toBeInTheDocument();
    expect(server.calls('DELETE /notifications/:id')[0].path).toBe('/notifications/3');
    expect(server.calls('GET /notifications')).toHaveLength(loads);
  });
});

describe('공지·고객센터·약관', () => {
  it('공지 목록에서 누르면 상세(?noticeId=)를 보여 준다', async () => {
    mockApi({
      'GET /notices': ok(
        page([
          {
            noticeId: 1,
            title: '영수증 인증 기준이 바뀌었어요',
            tag: null,
            isPinned: true,
            regDate: '2026-09-20T10:00:00+09:00',
          },
        ]),
      ),
      'GET /notices/:id': ok({
        noticeId: 1,
        title: '영수증 인증 기준이 바뀌었어요',
        tag: null,
        isPinned: true,
        regDate: '2026-09-20T10:00:00+09:00',
        updatedAt: null,
        content: '결제일로부터 7일 안의 영수증만 인증할 수 있어요.',
      }),
    });
    const { router } = renderRoute('/notices');
    fireEvent.click(
      await screen.findByRole('link', { name: /영수증 인증 기준이 바뀌었어요.*필독/ }),
    );
    expect(router.state.location.search).toBe('?noticeId=1');
    expect(
      await screen.findByText('결제일로부터 7일 안의 영수증만 인증할 수 있어요.'),
    ).toBeInTheDocument();
    expect(screen.getByText('2026.09.20 · 먹장깨기 운영팀')).toBeInTheDocument();
  });

  it('자주 묻는 질문을 펼치고, 1:1 문의를 보낸다', async () => {
    const server = mockApi({
      'GET /faqs': ok({
        items: [
          {
            faqId: 1,
            category: 'VISIT',
            question: '영수증 인증이 계속 실패해요',
            answer: '밝은 곳에서 찍어 주세요.',
          },
        ],
      }),
      'GET /inquiries/me': ok(page([])),
      'POST /inquiries': ok({ inquiryId: 9, status: 'WAITING' }),
    });
    renderRoute('/support');
    fireEvent.click(await screen.findByRole('button', { name: /영수증 인증이 계속 실패해요/ }));
    expect(screen.getByText('밝은 곳에서 찍어 주세요.')).toBeInTheDocument();

    const send = screen.getByRole('button', { name: '문의 보내기' });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '방문 인증' }));
    fireEvent.change(screen.getByLabelText('문의 내용'), {
      target: { value: '가게 정보가 달라요가 나와요' },
    });
    fireEvent.click(send);
    expect(
      await screen.findByText('문의를 보냈어요. 답변은 알림으로 알려 드려요'),
    ).toBeInTheDocument();
    expect(server.calls('POST /inquiries')[0].body).toEqual({
      category: 'VISIT',
      content: '가게 정보가 달라요가 나와요',
      imageKey: null,
    });
  });

  it('답변 알림(?inquiryId=)으로 오면 문의와 답변을 보여 준다', async () => {
    mockApi({
      'GET /inquiries/:id': ok({
        inquiryId: 9,
        category: 'VISIT',
        content: '가게 정보가 달라요가 나와요',
        imageUrl: null,
        refVisit: null,
        status: 'ANSWERED',
        answer: '확인해서 인증 처리했어요.',
        answeredAt: '2026-09-26T10:00:00+09:00',
        regDate: '2026-09-25T10:00:00+09:00',
      }),
    });
    renderRoute('/support?inquiryId=9');
    expect(await screen.findByText('확인해서 인증 처리했어요.')).toBeInTheDocument();
    expect(screen.getByText('답변 완료')).toBeInTheDocument();
  });

  it('약관은 로그인 없이 종류별로 보여 주고, 이벤트·혜택 알림은 안내 문구', async () => {
    const server = mockApi({
      'GET /terms/:type': ok({
        type: 'PRIVACY',
        version: '1.0',
        effectiveDate: '2026-09-01',
        content: '개인정보 처리방침 본문',
        versions: [{ version: '1.0', effectiveDate: '2026-09-01' }],
      }),
    });
    const { router } = renderRoute('/terms?type=PRIVACY', { session: { status: 'guest' } });
    expect(await screen.findByText('개인정보 처리방침 본문')).toBeInTheDocument();
    expect(server.calls('GET /terms/:type')[0].path).toBe('/terms/PRIVACY');
    expect(screen.getByText('시행일 2026.09.01 (현재)')).toBeInTheDocument();
    await router.navigate('/terms?type=MARKETING');
    expect(await screen.findByText('[선택] 이벤트·혜택 알림')).toBeInTheDocument();
  });
});

describe('설정·회원 탈퇴', () => {
  it('알림 스위치를 바꾸면 그 항목만 보낸다', async () => {
    const server = mockApi({
      'GET /users/me': ok({ id: 1, nickname: '아기깨비', localRegions: [] }),
      'GET /users/me/settings': ok({
        notification: {
          conquestAlarm: true,
          rankAlarm: true,
          marketingAlarm: false,
          marketingConsentChangedAt: null,
        },
        localRegions: [],
        account: { provider: 'KAKAO', joinedAt: '' },
      }),
      'PATCH /users/me/notification-settings': ok({}, '이벤트·혜택 알림을 켰어요.'),
    });
    renderRoute('/me/settings');
    const marketing = await screen.findByRole('switch', { name: '이벤트·혜택 알림' });
    expect(marketing).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(marketing);
    expect(marketing).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('이벤트·혜택 알림을 켰어요.')).toBeInTheDocument();
    expect(server.calls('PATCH /users/me/notification-settings')[0].body).toEqual({
      marketingAlarm: true,
    });
  });

  it('저장하는 동안 그 스위치는 잠그고, 설정을 못 불러오면 다시 시도할 수 있다', async () => {
    let finish = () => {};
    let loads = 0;
    const server = mockApi({
      'GET /users/me': ok({ id: 1, nickname: '아기깨비', localRegions: [] }),
      'GET /users/me/settings': () =>
        ++loads === 1
          ? fail(500, 'INTERNAL_SERVER_ERROR')
          : ok({
              notification: {
                conquestAlarm: true,
                rankAlarm: true,
                marketingAlarm: false,
                marketingConsentChangedAt: null,
              },
              localRegions: [],
              account: { provider: 'KAKAO', joinedAt: '' },
            }),
      'PATCH /users/me/notification-settings': () =>
        new Promise<ReturnType<typeof ok>>((resolve) => (finish = () => resolve(ok({})))),
    });
    renderRoute('/me/settings');

    fireEvent.click(await screen.findByRole('button', { name: /알림 설정을 불러오지 못했어요/ }));
    const rank = await screen.findByRole('switch', { name: '먹짱·순위 변동 알림' });
    fireEvent.click(rank);
    expect(rank).toBeDisabled();
    fireEvent.click(rank);
    finish();
    await waitFor(() => expect(rank).toBeEnabled());
    expect(rank).toHaveAttribute('aria-checked', 'false');
    expect(server.calls('PATCH /users/me/notification-settings')).toHaveLength(1);
  });

  it('안내를 확인하고 마지막으로 한 번 더 물은 뒤 탈퇴하고 로그아웃한다', async () => {
    const server = mockApi({
      'GET /users/me/withdrawal-summary': ok({
        nickname: '아기깨비',
        conquest: { restaurantCount: 16, sigunguCount: 3 },
        pointBalance: 1280,
        mukkaebi: { level: 7, itemCount: 7 },
        titleCount: 5,
        reviewCount: 9,
        reasonOptions: [
          { code: 'RARELY_USE', label: '자주 쓰지 않아요' },
          { code: 'ETC', label: '기타' },
        ],
      }),
      'DELETE /users/me': ok({ withdrawnAt: '2026-11-06T12:00:00+09:00' }),
    });
    const { router } = renderRoute('/me/withdraw');

    expect(await screen.findByText('16곳 · 3개 구')).toBeInTheDocument();
    const leave = screen.getByRole('button', { name: '탈퇴하기' });
    expect(leave).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '기타' }));
    fireEvent.change(screen.getByLabelText('기타 이유'), { target: { value: '잘 안 써요' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '안내를 모두 확인했어요' }));
    fireEvent.click(leave);
    const dialog = screen.getByRole('alertdialog', { name: '마지막으로 확인할게요' });
    expect(dialog).toHaveTextContent('아기깨비님의 정복 기록·먹깨비·먹포인트가 모두 사라져요.');
    fireEvent.click(within(dialog).getByRole('button', { name: '탈퇴' }));

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/me/withdraw'));
    expect(server.calls('DELETE /users/me')[0].body).toEqual({
      confirmed: true,
      reasonCode: 'ETC',
      reasonDetail: '잘 안 써요',
    });
  });

  it('탈퇴하는 동안 확인창에 알리고, 실패하면 탈퇴 버튼 위에 남긴다', async () => {
    let finish = () => {};
    mockApi({
      'GET /users/me/withdrawal-summary': ok({
        nickname: '아기깨비',
        conquest: { restaurantCount: 16, sigunguCount: 3 },
        pointBalance: 1280,
        mukkaebi: { level: 7, itemCount: 7 },
        titleCount: 5,
        reviewCount: 9,
        reasonOptions: [{ code: 'RARELY_USE', label: '자주 쓰지 않아요' }],
      }),
      'DELETE /users/me': () =>
        new Promise<ReturnType<typeof ok>>(
          (resolve) =>
            (finish = () =>
              resolve(fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.'))),
        ),
    });
    renderRoute('/me/withdraw');

    fireEvent.click(await screen.findByRole('checkbox', { name: '안내를 모두 확인했어요' }));
    fireEvent.click(screen.getByRole('button', { name: '탈퇴하기' }));
    fireEvent.click(screen.getByRole('button', { name: '탈퇴' }));
    expect(await screen.findByRole('button', { name: '탈퇴하는 중…' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해 주세요.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '자주 쓰지 않아요' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
