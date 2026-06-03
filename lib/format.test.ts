import { describe, expect, it } from "vitest";
import { compactAddress, formatIpAmount } from "./format";

describe("format helpers", () => {
  it("formats minor units as IP amount", () => {
    expect(formatIpAmount(12900)).toBe("129 IP");
    expect(formatIpAmount(12950)).toBe("129.5 IP");
  });

  it("compacts wallet addresses", () => {
    expect(compactAddress("0x7777777777777777777777777777777777777777")).toBe("0x7777...7777");
  });
});
