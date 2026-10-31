// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHistoryFeed } from './historyFeed';
import type { GuestbookMessage, ReadPageResult, UnavailableSignature } from './history';

const SIG_A = 'A'.repeat(88);
const SIG_B = 'B'.repeat(88);
const SIG_C = 'C'.repeat(88);
const SIG_D = 'D'.repeat(88);
const SIG_E = 'E'.repeat(88);
const SIG_F = 'F'.repeat(88);

function message(signature: string, slot: number, text = signature.slice(0, 4)): GuestbookMessage {
  return { signature, author: '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T', text, slot: BigInt(slot), blockTime: null, feeLamports: 5000n };
}

function unavailable(signature: string): UnavailableSignature {
  return { signature, reason: '交易读取超时，可重试。' };
}

function page(overrides: Partial<ReadPageResult> = {}): ReadPageResult {
  return {
    scope: 'board', author: null, messages: [], scanned: 0, filtered: 0,
    unavailable: [], nextCursor: null, sourceExhausted: true, ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createClient() {
  return {
    readPage: vi.fn<(scope: unknown, before?: string | null, signal?: AbortSignal, pageSize?: number) => Promise<ReadPageResult>>(),
    retrySignatures: vi.fn<(signatures: readonly unknown[], scope: unknown, signal?: AbortSignal) => Promise<ReadPageResult>>(),
  };
}

const BOARD = { kind: 'board' } as const;
const AUTHOR_B = { kind: 'author', author: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' } as const;

describe('historyFeed 初始读取与范围隔离', () => {
  it('挂载即读公共第一页，成功后保留真实字段', async () => {
    const client = createClient();
    const pending = deferred<ReadPageResult>();
    client.readPage.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));

    expect(result.current.phase).toBe('loading');
    expect(client.readPage).toHaveBeenCalledWith(BOARD, null, expect.any(AbortSignal));

    await act(async () => {
      pending.resolve(page({ messages: [message(SIG_A, 10, '真实留言')], scanned: 1, nextCursor: SIG_A, sourceExhausted: false }));
      await pending.promise;
    });

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.messages).toEqual([message(SIG_A, 10, '真实留言')]);
    expect(result.current.nextCursor).toBe(SIG_A);
    expect(result.current.exhausted).toBe(false);
  });

  it('范围切换首帧不显示旧范围内容，迟到结果与 finally 不覆盖新请求', async () => {
    const client = createClient();
    const boardPending = deferred<ReadPageResult>();
    const authorPending = deferred<ReadPageResult>();
    client.readPage.mockReturnValueOnce(boardPending.promise).mockReturnValueOnce(authorPending.promise);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: { kind: 'board' } | typeof AUTHOR_B }) => useHistoryFeed({ client, scope }),
      { initialProps: { scope: BOARD as { kind: 'board' } | typeof AUTHOR_B } },
    );
    await act(async () => {
      boardPending.resolve(page({ messages: [message(SIG_A, 10, '公共旧内容')], nextCursor: SIG_A, sourceExhausted: false }));
      await boardPending.promise;
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    rerender({ scope: AUTHOR_B });
    expect(result.current.messages).toEqual([]);
    expect(result.current.phase).toBe('loading');

    await act(async () => {
      boardPending.resolve(page({ messages: [message(SIG_B, 20, '不应出现的旧结果')] }));
      await Promise.resolve();
    });
    expect(result.current.messages).toEqual([]);

    act(() => result.current.refresh());
    expect(client.readPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      authorPending.resolve(page({
        scope: 'author',
        author: AUTHOR_B.author,
        messages: [message(SIG_C, 30, '作者新内容')],
        nextCursor: SIG_C,
        sourceExhausted: false,
      }));
      await authorPending.promise;
    });
    await waitFor(() => expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_C]));
  });
});


describe('historyFeed 同步操作锁', () => {
  it('同一范围连点刷新只发起一次请求，旧完成不释放新锁', async () => {
    const client = createClient();
    client.readPage.mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], nextCursor: SIG_A, sourceExhausted: false }));
    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    const refreshPending = deferred<ReadPageResult>();
    client.readPage.mockReturnValueOnce(refreshPending.promise);
    act(() => {
      result.current.refresh();
      result.current.refresh();
      result.current.loadMore();
    });
    expect(client.readPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      refreshPending.resolve(page({ messages: [message(SIG_B, 20)], nextCursor: SIG_B, sourceExhausted: false }));
      await refreshPending.promise;
    });
    await waitFor(() => expect(result.current.busy).toBeNull());
    expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_B]);
  });
});


describe('historyFeed 分页合并与游标循环', () => {
  it('加载更多按签名去重、全过滤页仍可继续，A→B→A 游标明确停止', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], scanned: 1, nextCursor: SIG_A, sourceExhausted: false }))
      .mockResolvedValueOnce(page({ messages: [message(SIG_B, 20), message(SIG_A, 10)], scanned: 4, filtered: 3, nextCursor: SIG_B, sourceExhausted: false }))
      .mockResolvedValueOnce(page({ messages: [message(SIG_C, 5)], scanned: 0, nextCursor: SIG_A, sourceExhausted: false }));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.scanned).toBe(1);

    act(() => result.current.loadMore());
    // 第2页的 slot 20 比第1页 slot 10 新；稳定合并按 slot 新到旧，不按请求先后追加。
    await waitFor(() => expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_B, SIG_A]));
    expect(result.current.nextCursor).toBe(SIG_B);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.scanned).toBe(5);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loopStopped).toBe(true));
    expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_B, SIG_A, SIG_C]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.scanned).toBe(5);
  });

  it('刷新失败保留旧记录和游标，不伪造空历史', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], nextCursor: SIG_A, sourceExhausted: false }))
      .mockRejectedValueOnce(new Error('RPC 429'));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.actionError?.operation).toBe('refresh'));

    expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_A]);
    expect(result.current.nextCursor).toBe(SIG_A);
    expect(result.current.exhausted).toBe(false);
    expect(result.current.phase).toBe('ready');
  });

  it('加载更多失败保留现有内容与原游标，重试仍从原边界继续', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], nextCursor: SIG_A, sourceExhausted: false }))
      .mockRejectedValueOnce(new Error('RPC 429'))
      .mockResolvedValueOnce(page({ messages: [message(SIG_B, 20)], nextCursor: SIG_B, sourceExhausted: false }));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.actionError?.operation).toBe('more'));
    expect(result.current.nextCursor).toBe(SIG_A);

    act(() => result.current.loadMore());
    // 失败后重试取得的 slot 20 记录应稳定合并到 slot 10 之前。
    await waitFor(() => expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_B, SIG_A]));
    expect(client.readPage).toHaveBeenLastCalledWith(BOARD, SIG_A, expect.any(AbortSignal));
  });

  it('成功刷新重置分页内容，但保留尚未解决的不可得签名', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({
        messages: [message(SIG_A, 10)], unavailable: [unavailable(SIG_D)],
        nextCursor: SIG_A, sourceExhausted: false,
      }))
      .mockResolvedValueOnce(page({
        messages: [message(SIG_B, 20)], unavailable: [unavailable(SIG_E)],
        nextCursor: SIG_B, sourceExhausted: false,
      }));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.unavailable).toHaveLength(1));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_B]));
    expect(result.current.unavailable.map((item) => item.signature)).toEqual([SIG_D, SIG_E]);
    expect(result.current.nextCursor).toBe(SIG_B);
  });
});


describe('historyFeed 不可得队列与重试', () => {
  it('翻页不丢前页不可得项，重试最多20个且不覆盖分页边界', async () => {
    const client = createClient();
    const queue = Array.from({ length: 25 }, (_, index) => unavailable(`S${index.toString().padStart(3, '0')}${'x'.repeat(84)}`));
    client.readPage
      .mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], unavailable: queue.slice(0, 20), nextCursor: SIG_A, sourceExhausted: false }))
      .mockResolvedValueOnce(page({ messages: [message(SIG_B, 20)], unavailable: queue.slice(20), nextCursor: SIG_B, sourceExhausted: false }));
    const retryPending = deferred<ReadPageResult>();
    client.retrySignatures.mockReturnValueOnce(retryPending.promise);

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.unavailable).toHaveLength(20));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.unavailable).toHaveLength(25));

    act(() => result.current.retryUnavailable());
    expect(client.retrySignatures).toHaveBeenCalledTimes(1);
    const batch = client.retrySignatures.mock.calls[0]![0];
    expect(batch).toHaveLength(20);

    const recovered = message(SIG_C, 30, '恢复记录');
    await act(async () => {
      retryPending.resolve(page({ messages: [recovered], unavailable: [unavailable(batch[1] as string)] }));
      await retryPending.promise;
    });
    await waitFor(() => expect(result.current.unavailable).toHaveLength(6));
    expect(result.current.messages).toContainEqual(recovered);
    expect(result.current.nextCursor).toBe(SIG_B);
    expect(result.current.exhausted).toBe(false);
  });

  it('重试失败保留整批队列', async () => {
    const client = createClient();
    client.readPage.mockResolvedValueOnce(page({
      unavailable: [unavailable(SIG_D), unavailable(SIG_E)], sourceExhausted: true,
    }));
    client.retrySignatures.mockRejectedValueOnce(new Error('RPC 503'));
    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.unavailable).toHaveLength(2));

    act(() => result.current.retryUnavailable());
    await waitFor(() => expect(result.current.actionError?.operation).toBe('retry'));
    expect(result.current.unavailable.map((item) => item.signature)).toEqual([SIG_D, SIG_E]);
    expect(result.current.exhausted).toBe(true);
  });


  it('恢复记录按slot从新到旧插入，同slot保留已显示顺序', async () => {
    const client = createClient();
    client.readPage.mockResolvedValueOnce(page({
      messages: [message(SIG_A, 10, 'A10'), message(SIG_B, 10, 'B10')],
      unavailable: [unavailable(SIG_D), unavailable(SIG_E)],
      nextCursor: SIG_B,
      sourceExhausted: true,
    }));
    client.retrySignatures.mockResolvedValueOnce(page({
      messages: [message(SIG_D, 10, 'D10'), message(SIG_E, 20, 'E20')],
      sourceExhausted: false,
    }));
    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => result.current.retryUnavailable());
    await waitFor(() => expect(result.current.unavailable).toHaveLength(0));
    expect(result.current.messages.map((item) => item.text)).toEqual(['E20', 'A10', 'B10', 'D10']);
    expect(result.current.nextCursor).toBe(SIG_B);
    expect(result.current.exhausted).toBe(true);
  });
});

describe('historyFeed R1 卸载与范围切换取消当前手动请求', () => {
  it('刷新进行中卸载会取消传入客户端的信号，迟到成功不回写', async () => {
    const client = createClient();
    client.readPage.mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], nextCursor: SIG_A, sourceExhausted: false }));
    const pending = deferred<ReadPageResult>();
    let activeSignal: AbortSignal | undefined;
    const renders = vi.fn();
    const { result, unmount } = renderHook(() => {
      renders();
      return useHistoryFeed({ client, scope: BOARD });
    });
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    client.readPage.mockImplementationOnce((_scope, _before, signal) => {
      activeSignal = signal;
      return pending.promise;
    });
    act(() => result.current.refresh());
    expect(result.current.busy).toBe('refresh');
    expect(activeSignal).toBeDefined();

    unmount();
    expect(activeSignal?.aborted).toBe(true);
    const rendersAtUnmount = renders.mock.calls.length;

    await act(async () => {
      pending.resolve(page({ messages: [message(SIG_B, 20)], nextCursor: SIG_B, sourceExhausted: false }));
      await Promise.resolve();
    });
    expect(renders).toHaveBeenCalledTimes(rendersAtUnmount);
  });

  it('翻页进行中卸载会取消传入客户端的信号，迟到失败不回写', async () => {
    const client = createClient();
    client.readPage.mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], nextCursor: SIG_A, sourceExhausted: false }));
    const pending = deferred<ReadPageResult>();
    let activeSignal: AbortSignal | undefined;
    const renders = vi.fn();
    const { result, unmount } = renderHook(() => {
      renders();
      return useHistoryFeed({ client, scope: BOARD });
    });
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    client.readPage.mockImplementationOnce((_scope, _before, signal) => {
      activeSignal = signal;
      return pending.promise;
    });
    act(() => result.current.loadMore());
    expect(result.current.busy).toBe('more');
    expect(activeSignal).toBeDefined();

    unmount();
    expect(activeSignal?.aborted).toBe(true);
    const rendersAtUnmount = renders.mock.calls.length;

    await act(async () => {
      pending.reject(new Error('迟到失败'));
      await Promise.resolve();
    });
    expect(renders).toHaveBeenCalledTimes(rendersAtUnmount);
  });

  it('不可得重试进行中卸载会取消传入客户端的信号，迟到结果不回写', async () => {
    const client = createClient();
    client.readPage.mockResolvedValueOnce(page({
      unavailable: [unavailable(SIG_D)], nextCursor: SIG_A, sourceExhausted: false,
    }));
    const pending = deferred<ReadPageResult>();
    let activeSignal: AbortSignal | undefined;
    const renders = vi.fn();
    const { result, unmount } = renderHook(() => {
      renders();
      return useHistoryFeed({ client, scope: BOARD });
    });
    await waitFor(() => expect(result.current.unavailable).toHaveLength(1));

    client.retrySignatures.mockImplementationOnce((_signatures, _scope, signal) => {
      activeSignal = signal;
      return pending.promise;
    });
    act(() => result.current.retryUnavailable());
    expect(result.current.busy).toBe('retry');
    expect(activeSignal).toBeDefined();

    unmount();
    expect(activeSignal?.aborted).toBe(true);
    const rendersAtUnmount = renders.mock.calls.length;

    await act(async () => {
      pending.resolve(page({ messages: [message(SIG_D, 10)] }));
      await Promise.resolve();
    });
    expect(renders).toHaveBeenCalledTimes(rendersAtUnmount);
  });

  it('范围切换取消旧范围手动刷新，迟到结果不写入新范围且不触发新请求', async () => {
    const client = createClient();
    const refreshPending = deferred<ReadPageResult>();
    const authorPending = deferred<ReadPageResult>();
    let refreshSignal: AbortSignal | undefined;
    client.readPage
      .mockResolvedValueOnce(page({ messages: [message(SIG_A, 10)], nextCursor: SIG_A, sourceExhausted: false }))
      .mockImplementationOnce((_scope, _before, signal) => {
        refreshSignal = signal;
        return refreshPending.promise;
      })
      .mockReturnValueOnce(authorPending.promise);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: { kind: 'board' } | typeof AUTHOR_B }) => useHistoryFeed({ client, scope }),
      { initialProps: { scope: BOARD as { kind: 'board' } | typeof AUTHOR_B } },
    );
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    act(() => result.current.refresh());
    expect(refreshSignal).toBeDefined();
    rerender({ scope: AUTHOR_B });
    expect(refreshSignal?.aborted).toBe(true);
    expect(result.current.phase).toBe('loading');
    expect(result.current.messages).toEqual([]);
    expect(client.readPage).toHaveBeenCalledTimes(3);

    await act(async () => {
      refreshPending.resolve(page({ messages: [message(SIG_B, 20, '旧范围迟到')], nextCursor: SIG_B, sourceExhausted: false }));
      await Promise.resolve();
    });
    expect(result.current.messages).toEqual([]);
    act(() => result.current.refresh());
    expect(client.readPage).toHaveBeenCalledTimes(3);

    await act(async () => {
      authorPending.resolve(page({
        scope: 'author',
        author: AUTHOR_B.author,
        messages: [message(SIG_C, 30, '新范围内容')],
        nextCursor: SIG_C,
        sourceExhausted: false,
      }));
      await authorPending.promise;
    });
    await waitFor(() => expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_C]));
  });
});



describe('historyFeed R2 分页稳定合并与不可得核销', () => {
  it('刷新后先恢复旧记录，再加载中间页仍按slot新到旧合并', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({
        messages: [message(SIG_A, 100, '旧头')], unavailable: [unavailable(SIG_E)],
        nextCursor: SIG_A, sourceExhausted: false,
      }))
      .mockResolvedValueOnce(page({
        messages: [message(SIG_B, 120, '新头')],
        nextCursor: SIG_B, sourceExhausted: false,
      }))
      .mockResolvedValueOnce(page({
        messages: [message(SIG_C, 110, '中间')],
        nextCursor: SIG_C, sourceExhausted: false,
      }));
    client.retrySignatures.mockResolvedValueOnce(page({
      messages: [message(SIG_E, 70, '旧恢复')],
    }));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.unavailable.map((item) => item.signature)).toEqual([SIG_E]);

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_B]));
    expect(result.current.unavailable.map((item) => item.signature)).toEqual([SIG_E]);

    act(() => result.current.retryUnavailable());
    await waitFor(() => expect(result.current.unavailable).toHaveLength(0));
    expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_B, SIG_E]);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    expect(result.current.messages.map((item) => item.text)).toEqual(['新头', '中间', '旧恢复']);
    expect(result.current.nextCursor).toBe(SIG_C);
  });

  it('刷新返回已验证消息时核销旧不可得项，不因本页重复不可得项而回加', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({
        messages: [message(SIG_A, 20, '旧头')],
        unavailable: [unavailable(SIG_D), unavailable(SIG_E)],
        nextCursor: SIG_A,
        sourceExhausted: false,
      }))
      .mockResolvedValueOnce(page({
        messages: [message(SIG_D, 30, '刷新恢复')],
        unavailable: [unavailable(SIG_D), unavailable(SIG_E)],
        nextCursor: SIG_D,
        sourceExhausted: false,
      }));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.unavailable).toHaveLength(2));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_D]));
    expect(result.current.unavailable.map((item) => item.signature)).toEqual([SIG_E]);
  });

  it('重叠页成功返回不可得签名时移除对应队列项，其他待重试项保留', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({
        messages: [message(SIG_A, 20, '头部')],
        unavailable: [unavailable(SIG_D), unavailable(SIG_E)],
        nextCursor: SIG_A,
        sourceExhausted: false,
      }))
      .mockResolvedValueOnce(page({
        messages: [message(SIG_D, 10, '同文'), message(SIG_B, 10, '同文')],
        unavailable: [unavailable(SIG_D), unavailable(SIG_E)],
        nextCursor: SIG_B,
        sourceExhausted: false,
      }));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.unavailable).toHaveLength(2));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    expect(result.current.messages.map((item) => item.signature)).toEqual([SIG_A, SIG_D, SIG_B]);
    expect(result.current.messages.filter((item) => item.text === '同文')).toHaveLength(2);
    expect(result.current.unavailable.map((item) => item.signature)).toEqual([SIG_E]);
  });

  it('恢复旧记录后跨多页加载仍保持slot顺序、同slot已显示顺序与页内顺序', async () => {
    const client = createClient();
    client.readPage
      .mockResolvedValueOnce(page({
        messages: [message(SIG_A, 30, 'A30'), message(SIG_B, 30, 'B30')],
        unavailable: [unavailable(SIG_F)],
        nextCursor: SIG_B,
        sourceExhausted: false,
      }))
      .mockResolvedValueOnce(page({
        messages: [message(SIG_C, 30, 'C30'), message(SIG_D, 20, 'D20')],
        nextCursor: SIG_D,
        sourceExhausted: false,
      }))
      .mockResolvedValueOnce(page({
        messages: [message(SIG_E, 20, 'E20')],
        nextCursor: SIG_E,
        sourceExhausted: true,
      }));
    client.retrySignatures.mockResolvedValueOnce(page({
      messages: [message(SIG_F, 20, 'F20')],
    }));

    const { result } = renderHook(() => useHistoryFeed({ client, scope: BOARD }));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => result.current.retryUnavailable());
    await waitFor(() => expect(result.current.unavailable).toHaveLength(0));
    expect(result.current.messages.map((item) => item.text)).toEqual(['A30', 'B30', 'F20']);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.messages).toHaveLength(5));
    expect(result.current.messages.map((item) => item.text)).toEqual(['A30', 'B30', 'C30', 'F20', 'D20']);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.messages).toHaveLength(6));
    expect(result.current.messages.map((item) => item.text)).toEqual(['A30', 'B30', 'C30', 'F20', 'D20', 'E20']);
    expect(result.current.nextCursor).toBe(SIG_E);
  });
});
