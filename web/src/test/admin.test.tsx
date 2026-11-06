import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminInquiry, AdminReport } from '../api/admin';
import { fail, mockApi, ok } from './http';
import { renderRoute } from './render';

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  size: 20,
  totalCount: items.length,
  hasNext: false,
});

const reviewReport = (patch: Partial<AdminReport> = {}): AdminReport => ({
  reportId: 11,
  targetType: 'REVIEW',
  targetId: 50,
  reason: 'AD',
  detail: '협찬 표시가 없어요',
  status: 'PENDING',
  regDate: '2026-11-05T10:00:00+09:00',
  processedAt: null,
  reporter: { userId: 3, nickname: '가양동먹보' },
  pendingCount: 2,
  review: {
    reviewId: 50,
    status: 'VISIBLE',
    overallScore: 5,
    content: '사장님이 서비스 주셨어요',
    author: { userId: 4, nickname: '광고왕' },
    restaurant: { restaurantId: 7, name: '새맛집' },
  },
  member: null,
  ...patch,
});

const inquiry = (patch: Partial<AdminInquiry> = {}): AdminInquiry => ({
  inquiryId: 21,
  category: 'VISIT',
  content: '영수증 인증이 안 돼요',
  imageUrl: null,
  refVisitId: 31,
  user: { userId: 5, nickname: '동네미식가' },
  status: 'WAITING',
  answer: null,
  regDate: '2026-11-05T11:00:00+09:00',
  answeredAt: null,
  ...patch,
});

describe('운영 관리', () => {
  it('운영자에게만 내 정보에 운영 관리 메뉴가 보인다', async () => {
    const me = { id: 1, nickname: '운영자', localRegions: [], isAdmin: true };
    mockApi({ 'GET /users/me': ok(me) });
    renderRoute('/me');
    expect(await screen.findByRole('link', { name: /운영 관리/ })).toHaveAttribute(
      'href',
      '/admin',
    );
  });

  it('신고를 확인창을 거쳐 블라인드하면 같은 대상 신고도 함께 끝났다고 알려 주고 다시 부른다', async () => {
    let done = false;
    const server = mockApi({
      'GET /admin/reports': () => ok(page(done ? [] : [reviewReport()])),
      'PATCH /admin/reports/:id': () => {
        done = true;
        return ok({ reportId: 11, status: 'DONE', closedCount: 2 });
      },
    });
    renderRoute('/admin');

    const card = await screen.findByRole('article', { name: '신고 11' });
    expect(card).toHaveTextContent('뒷광고 · 리뷰 이벤트');
    expect(card).toHaveTextContent('새맛집 · 광고왕 · 맛 ★ 5.0 · 보이는 중');
    expect(card).toHaveTextContent('같은 대상 신고 2건');
    expect(within(card).getByRole('link', { name: /새맛집/ })).toHaveAttribute(
      'href',
      '/reviews/50',
    );
    expect(server.calls('GET /admin/reports')[0].query.get('status')).toBe('PENDING');

    fireEvent.click(within(card).getByRole('button', { name: '블라인드' }));
    const dialog = screen.getByRole('alertdialog', { name: '블라인드할까요?' });
    expect(dialog).toHaveTextContent('같은 대상의 처리 전 신고 2건이 함께 끝나요.');
    fireEvent.click(within(dialog).getByRole('button', { name: '블라인드' }));

    expect(
      await screen.findByText('블라인드 처리했어요 · 같은 대상 신고 2건을 함께 끝냈어요'),
    ).toBeInTheDocument();
    expect(server.calls('PATCH /admin/reports/:id')[0]).toMatchObject({
      path: '/admin/reports/11',
      body: { action: 'HIDE_REVIEW' },
    });
    expect(await screen.findByText('신고가 없어요')).toBeInTheDocument();

    // 탐험가 신고만, 반려된 것만 골라 본다
    fireEvent.change(screen.getByRole('combobox', { name: '신고 대상' }), {
      target: { value: 'MEMBER' },
    });
    fireEvent.click(screen.getByRole('radio', { name: '반려' }));
    await waitFor(() => {
      const query = server.calls('GET /admin/reports').at(-1)?.query;
      expect(query?.get('targetType')).toBe('MEMBER');
      expect(query?.get('status')).toBe('REJECTED');
    });
  });

  it('탐험가 신고는 이용 정지·반려만 고를 수 있다', async () => {
    mockApi({
      'GET /admin/reports': ok(
        page([
          reviewReport({
            targetType: 'MEMBER',
            review: null,
            member: { userId: 4, nickname: '광고왕', status: 'ACTIVE', trustTemp: 32 },
          }),
        ]),
      ),
    });
    renderRoute('/admin');
    const card = await screen.findByRole('article', { name: '신고 11' });
    expect(card).toHaveTextContent('광고왕 · 활동 중 · 신뢰 온도 32.0°');
    expect(
      within(card)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['이용 정지', '반려']);
  });

  it('운영자가 아니면 볼 수 없다고 알려 준다', async () => {
    mockApi({ 'GET /admin/reports': fail(403, 'FORBIDDEN') });
    renderRoute('/admin');
    expect(await screen.findByText('운영자만 볼 수 있어요')).toBeInTheDocument();
  });

  it('문의에 답하면 보내고 답변 전 목록에서 뺀다', async () => {
    const server = mockApi({
      'GET /admin/inquiries': ok(page([inquiry()])),
      'PATCH /admin/inquiries/:id/answer': ok({
        inquiryId: 21,
        status: 'ANSWERED',
        answeredAt: '2026-11-06T10:00:00+09:00',
        notified: true,
      }),
    });
    renderRoute('/admin?tab=inquiries');

    const card = await screen.findByRole('article', { name: '문의 21' });
    expect(card).toHaveTextContent('방문 인증');
    expect(card).toHaveTextContent('방문 인증 #31');
    const send = within(card).getByRole('button', { name: '답변 보내기' });
    expect(send).toBeDisabled();
    fireEvent.change(within(card).getByRole('textbox', { name: '답변' }), {
      target: { value: '  영수증을 다시 찍어 주세요  ' },
    });
    fireEvent.click(send);

    expect(await screen.findByText('답변을 보내고 알림을 보냈어요')).toBeInTheDocument();
    expect(server.calls('PATCH /admin/inquiries/:id/answer')[0]).toMatchObject({
      path: '/admin/inquiries/21/answer',
      body: { answer: '영수증을 다시 찍어 주세요' },
    });
    expect(screen.queryByRole('article', { name: '문의 21' })).not.toBeInTheDocument();
    expect(screen.getByText('0건 · 오래된 순')).toBeInTheDocument();
  });

  it('더 보기가 실패하면 목록 아래에 알리고, 다시 시도하면 실패한 쪽을 다시 부른다', async () => {
    let failOnce = true;
    const server = mockApi({
      'GET /admin/inquiries': (call) => {
        if (call.query.get('page') === '2' && failOnce) {
          failOnce = false;
          return fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.');
        }
        return ok({
          items: [inquiry({ inquiryId: call.query.get('page') === '2' ? 22 : 21 })],
          page: Number(call.query.get('page')),
          size: 20,
          totalCount: 2,
          hasNext: call.query.get('page') === '1',
        });
      },
    });
    renderRoute('/admin?tab=inquiries');
    await screen.findByRole('article', { name: '문의 21' });
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('잠시 후 다시 시도해 주세요.');
    // 같은 "더 보기"를 다시 눌러도 실패한 2쪽을 다시 보낸다
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(await screen.findByRole('article', { name: '문의 22' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(server.calls('GET /admin/inquiries').map((c) => c.query.get('page'))).toEqual([
      '1',
      '2',
      '2',
    ]);
  });

  it('답한 뒤 다시 불러오기가 실패하면 알리고, 다시 시도는 1쪽부터', async () => {
    let calls = 0;
    const server = mockApi({
      'GET /admin/inquiries': () => {
        calls += 1;
        if (calls === 2) return fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.');
        return ok({
          items: calls === 1 ? [inquiry()] : [inquiry({ inquiryId: 22 })],
          page: 1,
          size: 20,
          totalCount: calls === 1 ? 22 : 21,
          hasNext: true,
        });
      },
      'PATCH /admin/inquiries/:id/answer': ok({
        inquiryId: 21,
        status: 'ANSWERED',
        answeredAt: '',
        notified: true,
      }),
    });
    renderRoute('/admin?tab=inquiries');
    const card = await screen.findByRole('article', { name: '문의 21' });
    fireEvent.change(within(card).getByRole('textbox', { name: '답변' }), {
      target: { value: '확인했어요' },
    });
    fireEvent.click(within(card).getByRole('button', { name: '답변 보내기' }));
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('article', { name: '문의 22' })).toBeInTheDocument();
    expect(server.calls('GET /admin/inquiries').map((c) => c.query.get('page'))).toEqual([
      '1',
      '1',
      '1',
    ]);
  });

  it('답변 전 문의가 다음 쪽까지 있으면 답한 뒤 1쪽부터 다시 불러 "더 보기"에서 건너뛰지 않는다', async () => {
    let answered = false;
    const server = mockApi({
      'GET /admin/inquiries': () =>
        ok({
          items: answered ? [inquiry({ inquiryId: 22 })] : [inquiry()],
          page: 1,
          size: 20,
          totalCount: answered ? 21 : 22,
          hasNext: true,
        }),
      'PATCH /admin/inquiries/:id/answer': () => {
        answered = true;
        return ok({ inquiryId: 21, status: 'ANSWERED', answeredAt: '', notified: true });
      },
    });
    renderRoute('/admin?tab=inquiries');
    const card = await screen.findByRole('article', { name: '문의 21' });
    fireEvent.change(within(card).getByRole('textbox', { name: '답변' }), {
      target: { value: '확인했어요' },
    });
    fireEvent.click(within(card).getByRole('button', { name: '답변 보내기' }));

    expect(await screen.findByRole('article', { name: '문의 22' })).toBeInTheDocument();
    const pages = server.calls('GET /admin/inquiries').map((c) => c.query.get('page'));
    expect(pages).toEqual(['1', '1']);
    expect(screen.getByText('21건 · 오래된 순')).toBeInTheDocument();
  });
});
