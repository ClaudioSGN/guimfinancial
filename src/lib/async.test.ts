import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./async";

describe("bounded parallel work", () => {
  it("runs concurrent requests, preserves input order and respects the limit", async () => {
    const release: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const result = mapWithConcurrency([10, 20, 30, 40], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => release.push(resolve));
      active -= 1;
      return value * 2;
    });
    expect(active).toBe(2);
    release[1]();
    await vi.waitFor(() => expect(release).toHaveLength(3));
    release[2]();
    await vi.waitFor(() => expect(release).toHaveLength(4));
    release[3]();
    release[0]();
    expect(await result).toEqual([20, 40, 60, 80]);
    expect(peak).toBe(2);
  });

  it("does not start work for an empty list", async () => {
    const mapper = vi.fn();
    expect(await mapWithConcurrency([], 3, mapper)).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it("propagates request errors and rejects an invalid limit", async () => {
    await expect(mapWithConcurrency([1], 1, async () => { throw new Error("upstream unavailable"); }))
      .rejects.toThrow("upstream unavailable");
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(RangeError);
  });
});
