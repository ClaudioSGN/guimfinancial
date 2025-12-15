import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type AccountRow = {
  id: string;
  name: string;
};

type TransactionRow = {
  date: string;
  description: string | null;
  value: number;
  type: "income" | "expense";
  category: string | null;
  account_id: string | null;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

const truncate = (text: string, max: number) => {
  if (max <= 3) return text.slice(0, max);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    const now = new Date();
    const year = yearParam ? Number(yearParam) : now.getFullYear();
    const month = monthParam ? Number(monthParam) : now.getMonth() + 1;

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Parâmetros de ano/mês inválidos." },
        { status: 400 }
      );
    }

    const { start, end } = getMonthRange(year, month);

    // Contas
    const { data: accountsData } = await supabase
      .from("accounts")
      .select("id, name");
    const accounts = (accountsData ?? []) as AccountRow[];
    const accountMap = new Map<string, string>();
    accounts.forEach((a) => accountMap.set(a.id, a.name));

    // Transações (apenas despesas do mês)
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .select("date, description, value, type, category, account_id")
      .gte("date", start.toISOString())
      .lt("date", end.toISOString())
      .eq("type", "expense");

    if (txError) {
      console.error(txError);
      return NextResponse.json(
        { error: "Erro ao buscar transações." },
        { status: 500 }
      );
    }

    const txs = (txData ?? []) as TransactionRow[];
    txs.sort((a, b) => (a.date < b.date ? -1 : 1));

    const total = txs.reduce(
      (sum, t) => sum + (Number(t.value) || 0),
      0
    );

    // ================== GERAÇÃO DO PDF ==================
    const pdfDoc = await PDFDocument.create();
    const fontTitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontBody = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let page = pdfDoc.addPage();
    let { width, height } = page.getSize();

    const marginX = 40;
    let cursorY = height - 50;

    const title = `Relatório de gastos - ${String(
      month
    ).padStart(2, "0")}/${year}`;

    // título
    page.drawText(title, {
      x: marginX,
      y: cursorY,
      size: 18,
      font: fontTitle,
      color: rgb(1, 1, 1),
    });

    cursorY -= 25;

    const subtitle = `Total de despesas no período: ${formatCurrency(
      total
    )}`;
    page.drawText(subtitle, {
      x: marginX,
      y: cursorY,
      size: 11,
      font: fontBody,
      color: rgb(0.8, 0.8, 0.8),
    });

    cursorY -= 25;

    // cabeçalho tabela
    page.drawText("Data", {
      x: marginX,
      y: cursorY,
      size: 10,
      font: fontTitle,
    });
    page.drawText("Descrição", {
      x: marginX + 70,
      y: cursorY,
      size: 10,
      font: fontTitle,
    });
    page.drawText("Categoria", {
      x: marginX + 260,
      y: cursorY,
      size: 10,
      font: fontTitle,
    });
    page.drawText("Conta", {
      x: marginX + 360,
      y: cursorY,
      size: 10,
      font: fontTitle,
    });
    page.drawText("Valor", {
      x: marginX + 470,
      y: cursorY,
      size: 10,
      font: fontTitle,
    });

    cursorY -= 12;
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: width - marginX, y: cursorY },
      thickness: 0.5,
      color: rgb(0.5, 0.5, 0.5),
    });
    cursorY -= 10;

    const lineHeight = 12;

    for (const tx of txs) {
      // se faltar espaço, cria nova página
      if (cursorY < 60) {
        page = pdfDoc.addPage();
        ({ width, height } = page.getSize());
        cursorY = height - 50;

        page.drawText(title, {
          x: marginX,
          y: cursorY,
          size: 14,
          font: fontTitle,
        });

        cursorY -= 20;

        page.drawText("Continuação...", {
          x: marginX,
          y: cursorY,
          size: 10,
          font: fontBody,
          color: rgb(0.8, 0.8, 0.8),
        });

        cursorY -= 20;

        // cabeçalho de novo
        page.drawText("Data", {
          x: marginX,
          y: cursorY,
          size: 10,
          font: fontTitle,
        });
        page.drawText("Descrição", {
          x: marginX + 70,
          y: cursorY,
          size: 10,
          font: fontTitle,
        });
        page.drawText("Categoria", {
          x: marginX + 260,
          y: cursorY,
          size: 10,
          font: fontTitle,
        });
        page.drawText("Conta", {
          x: marginX + 360,
          y: cursorY,
          size: 10,
          font: fontTitle,
        });
        page.drawText("Valor", {
          x: marginX + 470,
          y: cursorY,
          size: 10,
          font: fontTitle,
        });

        cursorY -= 12;
        page.drawLine({
          start: { x: marginX, y: cursorY },
          end: { x: width - marginX, y: cursorY },
          thickness: 0.5,
          color: rgb(0.5, 0.5, 0.5),
        });
        cursorY -= 10;
      }

      const d = new Date(tx.date);
      const dateStr = Number.isNaN(d.getTime())
        ? tx.date.slice(0, 10)
        : d.toLocaleDateString("pt-BR");

      const desc = truncate(
        tx.description ?? "(sem descrição)",
        28
      );
      const cat = truncate(tx.category ?? "-", 16);
      const accName = truncate(
        tx.account_id ? accountMap.get(tx.account_id) ?? "-" : "-",
        14
      );
      const val = formatCurrency(Number(tx.value) || 0);

      page.drawText(dateStr, {
        x: marginX,
        y: cursorY,
        size: 9,
        font: fontBody,
      });
      page.drawText(desc, {
        x: marginX + 70,
        y: cursorY,
        size: 9,
        font: fontBody,
      });
      page.drawText(cat, {
        x: marginX + 260,
        y: cursorY,
        size: 9,
        font: fontBody,
      });
      page.drawText(accName, {
        x: marginX + 360,
        y: cursorY,
        size: 9,
        font: fontBody,
      });
      page.drawText(val, {
        x: marginX + 470,
        y: cursorY,
        size: 9,
        font: fontBody,
      });

      cursorY -= lineHeight;
    }

    const pdfBytes = await pdfDoc.save();

    const fileName = `gastos-${year}-${String(month).padStart(
      2,
      "0"
    )}.pdf`;

    // ensure body is a supported type for the Response constructor
    return new NextResponse(pdfBytes.buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erro inesperado ao gerar PDF." },
      { status: 500 }
    );
  }
}
