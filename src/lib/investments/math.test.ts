import { describe, expect, it } from "vitest";
import Big from "big.js";
import {
  computeNewAveragePrice,
  computeQuantityFromValue,
  computeTotal,
} from "./math";

describe("investment math", () => {
  it("handles first buy", () => {
    const avg = computeNewAveragePrice(
      new Big(0),
      new Big(0),
      new Big(5),
      new Big(10),
    );
    expect(avg.toString()).toBe("10");
  });

  it("quantity mode total", () => {
    const total = computeTotal(new Big(3), new Big(12.5));
    expect(total.toString()).toBe("37.5");
  });

  it("value mode with rounding for integer assets", () => {
    const { quantity, total } = computeQuantityFromValue(
      new Big(100),
      new Big(33),
      0,
    );
    expect(quantity.toString()).toBe("3");
    expect(total.toString()).toBe("99");
  });

  it("value mode insufficient value", () => {
    const { quantity } = computeQuantityFromValue(
      new Big(10),
      new Big(15),
      0,
    );
    expect(quantity.toString()).toBe("0");
  });

  it("precision correctness for crypto", () => {
    const { quantity } = computeQuantityFromValue(
      new Big("123.456789"),
      new Big("2.5"),
      8,
    );
    expect(quantity.toString()).toBe("49.3827156");
  });
});
