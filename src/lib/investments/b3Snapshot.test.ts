import { describe, expect, it } from "vitest";
import {
  guessB3AssetSections,
  parseB3HistoryPayload,
  parseB3SnapshotFromHtml,
} from "./b3Snapshot";

describe("b3Snapshot", () => {
  it("parses stock indicators from embedded JSON", () => {
    const html = `
      <html>
        <head><title>CSAN3 - Cosan - Resultados, Dividendos, Cotação e Indicadores - Investidor10</title></head>
        <body>
          <p>Atualmente, <strong>COSAN (CSAN3)</strong> está cotada a <span class='livePrice'><strong>R$ 4,31</strong></span>. No último ano, a ação apresentou uma variação de <strong>-43,29%</strong> em sua cotação e distribuiu <strong>R$ 0,00</strong> em dividendos, resultando em um Dividend Yield de <strong>0,00%</strong>.</p>
          <img src="/storage/companies/66db243727a49.jpg" alt="CSAN3" />
          <script>
            let _sectorIndicators = {"p_vp":4.69,"vpa":13.866,"total_tickers":932370608.5,"variation_12_months":11.655,"dividend_yield_last_12_months":1.47};
          </script>
        </body>
      </html>
    `;

    const parsed = parseB3SnapshotFromHtml({
      symbol: "CSAN3",
      section: "acoes",
      sourceUrl: "https://investidor10.com.br/acoes/csan3/",
      html,
    });

    expect(parsed?.price).toBe(4.31);
    expect(parsed?.changePct).toBe(-43.29);
    expect(parsed?.dyPct).toBe(0);
    expect(parsed?.pVp).toBe(4.69);
    expect(parsed?.sharesOutstanding).toBe(932370608.5);
    expect(parsed?.bookValue).toBe(13.866);
    expect(parsed?.logoUrl).toBe("https://investidor10.com.br/storage/companies/66db243727a49.jpg");
  });

  it("guesses likely asset sections from symbol and name", () => {
    expect(guessB3AssetSections("BODB11", "Bocaina Infra FII")).toEqual([
      "fiis",
      "etfs",
      "acoes",
    ]);
    expect(guessB3AssetSections("BOVA11", "iShares Ibovespa ETF")).toEqual([
      "etfs",
      "acoes",
    ]);
    expect(guessB3AssetSections("AAPL34", "Apple BDR")).toEqual([
      "bdrs",
      "acoes",
    ]);
  });

  it("parses investidor10 history payloads for charts", () => {
    const parsed = parseB3HistoryPayload({
      real: [
        { price: 7.59, created_at: "20/05/2025" },
        { price: 7.63, created_at: "2025-05-21 10:05:00" },
      ],
    });

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ price: 7.59 });
    expect(parsed[1]).toMatchObject({ price: 7.63 });
    expect(parsed[0].time).toBeLessThan(parsed[1].time);
  });
});
