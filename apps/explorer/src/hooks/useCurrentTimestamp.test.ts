// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EPOCH_DURATION } from "@/utils/constants";
import { useCurrentTimestamp } from "./useCurrentTimestamp";

const START = new Date("2026-11-01T00:00:00Z");
const startSeconds = BigInt(START.getTime() / 1_000);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useCurrentTimestamp", () => {
  it("moves on once per epoch, not in between", () => {
    vi.useFakeTimers({ now: START });
    const { result } = renderHook(() => useCurrentTimestamp());

    expect(result.current).toBe(startSeconds);

    act(() => vi.advanceTimersByTime(EPOCH_DURATION * 1_000 - 1));
    expect(result.current).toBe(startSeconds);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(startSeconds + BigInt(EPOCH_DURATION));
  });

  it("stops ticking once unmounted", () => {
    vi.useFakeTimers({ now: START });
    const { unmount } = renderHook(() => useCurrentTimestamp());

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
