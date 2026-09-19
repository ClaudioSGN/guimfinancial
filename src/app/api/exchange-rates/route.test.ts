import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

describe("GET exchange rates", () => {
  it("returns validated dated USD quotes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([
      { base: "USD", quote: "BRL", date: "2026-09-18", rate: 5.2 },
      { base: "USD", quote: "EUR", date: "2026-09-18", rate: 0.9 },
    ])));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ base: "USD", source: "Frankfurter", quotes: { BRL: { rate: 5.2, date: "2026-09-18" } } });
  });
  it.each(["http", "network", "malformed"])("returns an explicit unavailable response on %s failure", async (failure) => {
    const fetchMock = vi.fn();
    if (failure === "network") fetchMock.mockRejectedValue(new Error("offline"));
    else fetchMock.mockResolvedValue(failure === "http" ? new Response(null, { status: 429 }) : Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "exchange_rates_unavailable" });
  });
});
