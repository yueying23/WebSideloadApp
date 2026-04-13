import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLog } from './use-log';

describe('useLog', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useLog());
    expect(result.current.lines).toEqual([]);
  });

  it('appends timestamped lines', () => {
    const { result } = renderHook(() => useLog());
    act(() => {
      result.current.addLog('hello');
    });
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatch(/\] hello$/);
  });

  it('caps at 200 lines (oldest dropped)', () => {
    const { result } = renderHook(() => useLog());
    act(() => {
      for (let i = 0; i < 250; i++) {
        result.current.addLog(`m${i}`);
      }
    });
    expect(result.current.lines).toHaveLength(200);
    expect(result.current.lines[0]).toMatch(/m50$/);
    expect(result.current.lines[199]).toMatch(/m249$/);
  });

  it('clearLog empties the buffer', () => {
    const { result } = renderHook(() => useLog());
    act(() => {
      result.current.addLog('x');
      result.current.clearLog();
    });
    expect(result.current.lines).toEqual([]);
  });
});
