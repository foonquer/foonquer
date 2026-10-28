import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../components/Dialog';
import { FilterChips } from '../components/Chips';
import { TextField } from '../components/TextField';
import { ToastProvider, useToast } from '../components/Toast';
import { useAsync } from '../lib/useAsync';

describe('TextField', () => {
  function PasswordInput() {
    const [value, setValue] = useState('secret12');
    return <TextField label="비밀번호" value={value} onChange={setValue} password />;
  }

  it('비밀번호는 가려 두고 "보기"를 누르면 보여 준다', () => {
    render(<PasswordInput />);
    const input = screen.getByLabelText('비밀번호');

    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: '보기' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: '숨기기' })).toBeInTheDocument();
  });

  it('ok 문구 앞에는 ✓, 에러면 입력창을 잘못됨으로 표시한다', () => {
    const { rerender } = render(
      <TextField
        label="이메일"
        value="a@b.com"
        onChange={() => {}}
        status="ok"
        message="사용할 수 있는 이메일이에요"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('✓ 사용할 수 있는 이메일이에요');

    rerender(
      <TextField
        label="이메일"
        value="a@b"
        onChange={() => {}}
        status="error"
        message="이메일 형식이 올바르지 않아요."
      />,
    );
    expect(screen.getByLabelText('이메일')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('이메일')).toHaveAccessibleDescription(
      '이메일 형식이 올바르지 않아요.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('이메일 형식이 올바르지 않아요.');
  });
});

describe('FilterChips', () => {
  it('고른 칩을 표시하고 누르면 값을 알려 준다', () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        label="정렬"
        value="LOCAL_POPULAR"
        onChange={onChange}
        options={[
          { value: 'LOCAL_POPULAR', label: '현지인 인기' },
          { value: 'REVISIT', label: '재방문 많음' },
        ]}
      />,
    );

    expect(screen.getByRole('radio', { name: '현지인 인기' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: '재방문 많음' }));
    expect(onChange).toHaveBeenCalledWith('REVISIT');
  });

  it('고른 칩만 Tab으로 들어오고 방향키로 옮겨 고른다', () => {
    function Sort() {
      const [value, setValue] = useState('LOCAL_POPULAR');
      return (
        <FilterChips
          label="정렬"
          value={value}
          onChange={setValue}
          options={[
            { value: 'LOCAL_POPULAR', label: '현지인 인기' },
            { value: 'REVISIT', label: '재방문 많음' },
            { value: 'DISTANCE', label: '가까운 순' },
          ]}
        />
      );
    }
    render(<Sort />);
    const first = screen.getByRole('radio', { name: '현지인 인기' });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '재방문 많음' })).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    const last = screen.getByRole('radio', { name: '가까운 순' });
    expect(last).toHaveAttribute('aria-checked', 'true');
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'ArrowRight' });
    expect(first).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Dialog', () => {
  it('취소·확인 버튼과 Esc로 닫기', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <Dialog
        open
        title="마포구 망원동을 뺄까요?"
        description={['이번 시즌에는 내 동네를 다시 바꿀 수 없어요']}
        confirmLabel="빼기"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole('alertdialog', { name: '마포구 망원동을 뺄까요?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '빼기' }));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('처리 중에는 취소·Esc·바깥 누르기로 닫지 않는다', () => {
    const onCancel = vi.fn();
    render(
      <Dialog
        open
        title="로그아웃할까요?"
        confirmLabel="로그아웃"
        onCancel={onCancel}
        onConfirm={() => {}}
        busy
      />,
    );

    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(document.querySelector('[aria-hidden="true"]')!);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('열리면 포커스를 확인창 안으로 옮기고, Tab이 밖으로 나가지 않으며, 닫히면 원래 자리로 돌려준다', () => {
    function Remove() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>빼기 열기</button>
          <Dialog
            open={open}
            title="뺄까요?"
            confirmLabel="빼기"
            onCancel={() => setOpen(false)}
            onConfirm={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Remove />);
    const trigger = screen.getByRole('button', { name: '빼기 열기' });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole('button', { name: '취소' });
    const confirm = screen.getByRole('button', { name: '빼기' });
    expect(cancel).toHaveFocus();
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.click(cancel);
    expect(trigger).toHaveFocus();
  });
});

describe('Toast', () => {
  function ShowButton() {
    const toast = useToast();
    return (
      <button
        onClick={() =>
          toast({
            message: '가고 싶은 곳에 저장했어요',
            action: { label: '리스트 보기', to: '/list' },
          })
        }
      >
        저장
      </button>
    );
  }

  it('잠깐 보여 주고 사라진다', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <ToastProvider>
          <ShowButton />
        </ToastProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByText('가고 싶은 곳에 저장했어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '리스트 보기 ›' })).toHaveAttribute('href', '/list');

    // 링크가 있는 토스트는 5초 동안 보이고, 링크에 포커스가 있으면 사라지지 않는다
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText('가고 싶은 곳에 저장했어요')).toBeInTheDocument();
    fireEvent.focus(screen.getByRole('link', { name: '리스트 보기 ›' }));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText('가고 싶은 곳에 저장했어요')).toBeInTheDocument();
    // 포커스를 둔 채 마우스만 올렸다 빼도 사라지지 않는다
    const box = screen.getByText('가고 싶은 곳에 저장했어요').parentElement!;
    fireEvent.mouseEnter(box);
    fireEvent.mouseLeave(box);
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText('가고 싶은 곳에 저장했어요')).toBeInTheDocument();
    // 다 떠나면 링크가 있는 토스트의 시간(5초)만큼 더 보여 준다
    fireEvent.blur(screen.getByRole('link', { name: '리스트 보기 ›' }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByText('가고 싶은 곳에 저장했어요')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('가고 싶은 곳에 저장했어요')).not.toBeInTheDocument();
  });
});

describe('useAsync', () => {
  it('deps가 바뀌면 다시 부르고, 늦게 온 이전 응답은 버린다', async () => {
    const resolvers: Record<number, (value: string) => void> = {};
    const load = (id: number) => new Promise<string>((resolve) => (resolvers[id] = resolve));

    const { result, rerender } = renderHook(({ id }) => useAsync(() => load(id), [id]), {
      initialProps: { id: 1 },
    });
    expect(result.current.loading).toBe(true);

    rerender({ id: 2 });
    await act(async () => resolvers[2]('두 번째'));
    await act(async () => resolvers[1]('첫 번째'));

    expect(result.current.data).toBe('두 번째');
    expect(result.current.loading).toBe(false);
  });
});
