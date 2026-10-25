import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { NOTICE_MS, useNotice } from './notice';

const REFUSED = {
  box: 'outputs',
  port: '+',
  reason: 'Only a step’s output can be reported, not an input or a test’s field.',
};

describe("a refused wire's message (M53)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function shown() {
    const hook = renderHook(() => useNotice());
    act(() => hook.result.current.show(REFUSED));
    expect(hook.result.current.notice).toMatchObject(REFUSED);
    return hook;
  }

  it('goes on the next press anywhere, starting another wire among them', () => {
    const { result } = shown();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(result.current.notice).toBeNull();
  });

  it('goes on Escape, and stays for any other key', () => {
    const { result } = shown();
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Tab' });
    });
    expect(result.current.notice).not.toBeNull();
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(result.current.notice).toBeNull();
  });

  it('goes by itself after a few seconds, a refusal said again starting its time again', () => {
    const { result } = shown();
    const wait = (ms: number) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    wait(NOTICE_MS - 1_000);
    act(() => result.current.show(REFUSED));
    expect(result.current.notice?.count).toBe(2);
    wait(NOTICE_MS - 1);
    expect(result.current.notice).not.toBeNull();
    wait(1);
    expect(result.current.notice).toBeNull();
    expect(NOTICE_MS).toBeLessThanOrEqual(6_000);
  });

  it('listens for nothing once it has gone', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { result } = shown();
    act(() => result.current.clear());
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    remove.mockRestore();
  });
});
