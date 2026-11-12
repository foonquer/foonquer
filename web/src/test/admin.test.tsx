import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdminFaq, AdminInquiry, AdminMember, AdminNotice, AdminReport } from '../api/admin';
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

  it('처리한 뒤 다시 불러오기가 실패해도 처리한 신고·같은 대상 신고는 다시 처리할 수 없다', async () => {
    let calls = 0;
    mockApi({
      'GET /admin/reports': () => {
        calls += 1;
        return calls === 1
          ? ok(
              page([
                reviewReport(),
                reviewReport({ reportId: 12 }),
                reviewReport({ reportId: 13, targetId: 51 }),
              ]),
            )
          : fail(500, 'INTERNAL_SERVER_ERROR', '잠시 후 다시 시도해 주세요.');
      },
      'PATCH /admin/reports/:id': ok({ reportId: 11, status: 'DONE', closedCount: 2 }),
    });
    renderRoute('/admin');
    const card = await screen.findByRole('article', { name: '신고 11' });
    fireEvent.click(within(card).getByRole('button', { name: '블라인드' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '블라인드' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해 주세요.');
    // 같은 리뷰(50) 신고 두 건은 버튼 없이 처리 표시, 다른 리뷰(51) 신고는 그대로
    for (const id of [11, 12]) {
      const c = screen.getByRole('article', { name: `신고 ${id}` });
      expect(within(c).queryByRole('button')).not.toBeInTheDocument();
      expect(c).toHaveTextContent('처리했어요');
    }
    expect(
      within(screen.getByRole('article', { name: '신고 13' })).getByRole('button', {
        name: '블라인드',
      }),
    ).toBeInTheDocument();
  });

  it('신고·문의 탭은 패널과 연결돼 있다', async () => {
    mockApi({ 'GET /admin/reports': ok(page([])) });
    renderRoute('/admin');
    const tab = await screen.findByRole('tab', { name: '신고' });
    const panel = screen.getByRole('tabpanel', { name: '신고' });
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(screen.getByRole('tab', { name: '1:1 문의' })).toHaveAttribute(
      'aria-controls',
      'admin-panel-inquiries',
    );
    expect(document.getElementById('admin-panel-inquiries')).not.toBeVisible();
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

  it('공지: 새 공지를 올리고, 숨긴 공지는 숨김으로 보이며 다시 보이게 할 수 있다', async () => {
    const notice = (patch: Partial<AdminNotice> = {}): AdminNotice => ({
      noticeId: 1,
      title: '시즌 4 안내',
      tag: null,
      isPinned: true,
      status: 'HIDDEN',
      content: '시즌 4가 시작돼요',
      regDate: '2026-11-13T10:00:00+09:00',
      updatedAt: '2026-11-13T10:00:00+09:00',
      ...patch,
    });
    const server = mockApi({
      'GET /admin/notices': ok(page([notice()])),
      'POST /admin/notices': ok({}),
      'PATCH /admin/notices/:id': ok({}),
    });
    renderRoute('/admin?tab=notices');

    const card = await screen.findByRole('article', { name: '공지 1' });
    expect(card).toHaveTextContent('필독');
    expect(card).toHaveTextContent('숨김');
    fireEvent.click(within(card).getByRole('button', { name: '다시 보이기' }));
    await waitFor(() =>
      expect(server.calls('PATCH /admin/notices/:id')[0].body).toEqual({ status: 'VISIBLE' }),
    );
    expect(await within(card).findByRole('button', { name: '숨기기' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '새 공지' }));
    const form = screen.getByRole('form', { name: '새 공지' });
    fireEvent.change(within(form).getByLabelText('제목'), { target: { value: '점검 안내' } });
    fireEvent.change(within(form).getByLabelText('말머리 (선택)'), { target: { value: '점검' } });
    fireEvent.change(within(form).getByLabelText('내용'), { target: { value: '새벽 2시 점검' } });
    fireEvent.click(within(form).getByRole('button', { name: '공지 올리기' }));
    await waitFor(() =>
      expect(server.calls('POST /admin/notices')[0].body).toEqual({
        title: '점검 안내',
        content: '새벽 2시 점검',
        tag: '점검',
        isPinned: false,
      }),
    );
    await waitFor(() => expect(server.calls('GET /admin/notices')).toHaveLength(2));
    expect(screen.queryByRole('form', { name: '새 공지' })).not.toBeInTheDocument();
  });

  it('FAQ: 유형으로 거르고, 고치면 보낸 내용으로 저장한다', async () => {
    const faq: AdminFaq = {
      faqId: 5,
      category: 'POINT',
      question: '먹포인트는 어디에 쓰나요?',
      answer: '상점에서 써요.',
      sortOrder: 1,
      status: 'VISIBLE',
    };
    const server = mockApi({
      'GET /admin/faqs': ok({ items: [faq] }),
      'PATCH /admin/faqs/:id': ok({}),
    });
    renderRoute('/admin?tab=faqs');

    const card = await screen.findByRole('article', { name: 'FAQ 5' });
    expect(card).toHaveTextContent('먹포인트');
    fireEvent.click(screen.getByRole('radio', { name: '먹포인트' }));
    await waitFor(() =>
      expect(server.calls('GET /admin/faqs').at(-1)?.query.get('category')).toBe('POINT'),
    );

    fireEvent.click(
      within(await screen.findByRole('article', { name: 'FAQ 5' })).getByRole('button', {
        name: '고치기',
      }),
    );
    const form = screen.getByRole('form', { name: 'FAQ 고치기' });
    fireEvent.change(within(form).getByLabelText('답변'), {
      target: { value: '상점에서 모자·얼굴·소품을 사요.' },
    });
    fireEvent.click(within(form).getByRole('button', { name: '고친 내용 저장' }));
    await waitFor(() =>
      expect(server.calls('PATCH /admin/faqs/:id')[0].body).toEqual({
        category: 'POINT',
        question: '먹포인트는 어디에 쓰나요?',
        answer: '상점에서 모자·얼굴·소품을 사요.',
        sortOrder: 1,
      }),
    );
  });

  it('약관: 시행 중인 버전과 기록을 보고, 지금 본문을 채운 채 확인창을 거쳐 새 버전을 올린다', async () => {
    const server = mockApi({
      'GET /terms/:type': (call) =>
        ok({
          type: call.path.split('/').at(-1),
          version: '2026-11-13',
          effectiveDate: '2026-11-13',
          content: '개인정보 처리방침 본문',
          versions: [
            { version: '2099-01-01', effectiveDate: '2099-01-01' },
            { version: '2026-11-13', effectiveDate: '2026-11-13' },
          ],
        }),
      'POST /admin/policy-documents': ok({}),
    });
    renderRoute('/admin?tab=terms');

    fireEvent.click(await screen.findByRole('radio', { name: '개인정보 처리방침' }));
    await waitFor(() =>
      expect(server.calls('GET /terms/:type').at(-1)?.path).toBe('/terms/PRIVACY'),
    );
    const history = await screen.findByRole('list', { name: '버전 기록' });
    expect(history).toHaveTextContent('2099-01-01 · 2099.1.1 시행 · 시행 예정');
    expect(history).toHaveTextContent('2026-11-13 · 2026.11.13 시행 · 지금');

    fireEvent.click(screen.getByRole('button', { name: '새 버전 올리기' }));
    const form = screen.getByRole('form', { name: '개인정보 처리방침 새 버전' });
    expect(within(form).getByLabelText('본문')).toHaveValue('개인정보 처리방침 본문');
    fireEvent.change(within(form).getByLabelText('시행일'), { target: { value: '2099-02-01' } });
    expect(within(form).getByLabelText('버전 이름')).toHaveValue('2099-02-01');
    fireEvent.change(within(form).getByLabelText('본문'), { target: { value: '새 본문' } });
    fireEvent.click(within(form).getByRole('button', { name: '새 버전 올리기' }));
    fireEvent.click(await screen.findByRole('button', { name: '올리기' }));
    await waitFor(() =>
      expect(server.calls('POST /admin/policy-documents')[0].body).toEqual({
        type: 'PRIVACY',
        version: '2099-02-01',
        content: '새 본문',
        effectiveDate: '2099-02-01',
      }),
    );
  });

  it('회원: 사진 삭제 대기를 거르고, 활동 중인 회원은 확인창을 거쳐 이용 정지한다', async () => {
    const member = (patch: Partial<AdminMember> = {}): AdminMember => ({
      userId: 9,
      nickname: '나쁜탐험가',
      status: 'ACTIVE',
      role: 'USER',
      trustTemp: 48.5,
      pendingReportCount: 2,
      regDate: '2026-11-01T10:00:00+09:00',
      lastLoginAt: null,
      withdrawnAt: null,
      photoPurgePending: false,
      ...patch,
    });
    const gone = member({
      userId: 3,
      nickname: null,
      status: 'WITHDRAWN',
      withdrawnAt: '2026-11-08T10:00:00+09:00',
      photoPurgePending: true,
    });
    const server = mockApi({
      'GET /admin/members': (call) =>
        ok(page(call.query.get('photoPurgePending') === 'true' ? [gone] : [member()])),
      'PATCH /admin/members/:id/status': ok({ userId: 9, status: 'SUSPENDED' }),
    });
    renderRoute('/admin?tab=members');

    const card = await screen.findByRole('article', { name: '회원 9' });
    expect(card).toHaveTextContent('신뢰 온도 48.5° · 처리 전 신고 2건 · 2026.11.1 가입');
    fireEvent.click(within(card).getByRole('button', { name: '이용 정지' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('신뢰 온도는 그대로예요');
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '이용 정지' }),
    );
    await waitFor(() =>
      expect(server.calls('PATCH /admin/members/:id/status')[0].body).toEqual({
        status: 'SUSPENDED',
      }),
    );
    expect(await within(card).findByRole('button', { name: '정지 풀기' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '사진 삭제 대기' }));
    const stuck = await screen.findByRole('article', { name: '회원 3' });
    expect(stuck).toHaveTextContent('탈퇴한 탐험가');
    expect(stuck).toHaveTextContent('2026.11.8 탈퇴');
    expect(within(stuck).getByRole('note')).toHaveTextContent('사진 삭제 대기');
    expect(within(stuck).queryByRole('button')).not.toBeInTheDocument();
    const last = server.calls('GET /admin/members').at(-1);
    expect(last?.query.get('photoPurgePending')).toBe('true');
    expect(last?.query.get('status')).toBeNull();
  });
});
