import { NextRequest, NextResponse } from "next/server";

type EntryType = "income" | "expense" | "card_expense" | "unknown";

type ParseRequestBody = {
  text?: string;
  language?: "pt" | "en";
  today?: string;
  accounts?: string[];
  cards?: string[];
};

type ParseResult = {
  entryType: EntryType;
  amount: number | null;
  description: string | null;
  category: string | null;
  date: string | null;
  accountName: string | null;
  cardName: string | null;
  confidence: number;
  missingFields: string[];
  source: "ai" | "rules";
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseBaseDate(value?: string) {
  if (!value) return new Date();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function findMentionedEntity(text: string, items: string[]) {
  const normalized = normalizeText(text);
  const sorted = [...items].sort((a, b) => b.length - a.length);
  return (
    sorted.find((item) => {
      const candidate = normalizeText(item);
      return candidate && normalized.includes(candidate);
    }) ?? null
  );
}

function parseAmount(text: string) {
  const sanitized = text
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");

  const hinted = sanitized.match(
    /\b(?:de|por|no valor de|valor de|for|amount of)\s*(r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
  );
  const fallback = sanitized.match(
    /(r\$\s*|usd\s*|eur\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
  );
  const raw = hinted?.[2] ?? fallback?.[2];
  if (!raw) return null;

  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.includes(",")
      ? raw.replace(",", ".")
      : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseDateFromText(text: string, today: Date) {
  const normalized = normalizeText(text);
  if (/\b(hoje|today)\b/.test(normalized)) return toDateString(today);
  if (/\b(ontem|yesterday)\b/.test(normalized)) return toDateString(addDays(today, -1));
  if (/\b(amanha|amanhã|tomorrow)\b/.test(normalized)) return toDateString(addDays(today, 1));

  const isoMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const localMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (localMatch) {
    const [, dayRaw, monthRaw, yearRaw] = localMatch;
    const year = yearRaw
      ? yearRaw.length === 2
        ? 2000 + Number(yearRaw)
        : Number(yearRaw)
      : today.getFullYear();
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return toDateString(today);
}

function inferEntryType(text: string, cardName: string | null): EntryType {
  const normalized = normalizeText(text);
  if (/\b(recebi|ganhei|salario|salário|income|salary|payroll|deposit)\b/.test(normalized)) {
    return "income";
  }
  if (cardName || /\b(cartao|cartão|credito|crédito|card|visa|mastercard)\b/.test(normalized)) {
    return "card_expense";
  }
  if (/\b(gastei|paguei|despesa|expense|spent|bought|buy|compra)\b/.test(normalized)) {
    return "expense";
  }
  return "unknown";
}

function inferCategoryAndDescription(text: string, language: "pt" | "en") {
  const normalized = normalizeText(text);
  const dictionary = [
    { keywords: ["uber", "99", "taxi", "combustivel", "gasolina", "transporte"], categoryPt: "Transporte", categoryEn: "Transport", description: "Uber" },
    { keywords: ["mercado", "supermercado", "ifood", "restaurante", "almoco", "jantar", "lunch", "dinner"], categoryPt: "Alimentacao", categoryEn: "Food", description: "Mercado" },
    { keywords: ["amazon", "shopee", "magalu", "loja", "store"], categoryPt: "Compras", categoryEn: "Shopping", description: "Amazon" },
    { keywords: ["aluguel", "rent"], categoryPt: "Moradia", categoryEn: "Housing", description: "Aluguel" },
    { keywords: ["salario", "salário", "salary", "payroll"], categoryPt: "Salario", categoryEn: "Salary", description: "Salario" },
    { keywords: ["farmacia", "saude", "health"], categoryPt: "Saude", categoryEn: "Health", description: "Farmacia" },
  ];

  const matched = dictionary.find((item) =>
    item.keywords.some((keyword) => normalized.includes(normalizeText(keyword))),
  );
  if (matched) {
    return {
      category: language === "pt" ? matched.categoryPt : matched.categoryEn,
      description: matched.description,
    };
  }

  const cleaned = normalized
    .replace(/\b(adicione|adicionar|adicione|nova|novo|uma|um|despesa|receita|cartao|cartão|card|no|na|de|do|da|por|hoje|ontem|amanha|amanhã|add|new|expense|income|yesterday|today|tomorrow)\b/g, " ")
    .replace(/\b\d+[.,]?\d*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const description = cleaned
    ? cleaned
        .split(" ")
        .slice(0, 3)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : null;

  return {
    category: null,
    description,
  };
}

function buildRuleBasedResult(body: Required<Pick<ParseRequestBody, "text" | "language" | "today" | "accounts" | "cards">>): ParseResult {
  const today = parseBaseDate(body.today);
  const amount = parseAmount(body.text);
  const accountName = findMentionedEntity(body.text, body.accounts);
  const cardName = findMentionedEntity(body.text, body.cards);
  const entryType = inferEntryType(body.text, cardName);
  const { category, description } = inferCategoryAndDescription(body.text, body.language);
  const date = parseDateFromText(body.text, today);

  const missingFields: string[] = [];
  if (!amount) missingFields.push(body.language === "pt" ? "valor" : "amount");
  if ((entryType === "expense" || entryType === "income") && !accountName) {
    missingFields.push(body.language === "pt" ? "conta" : "account");
  }
  if (entryType === "card_expense" && !cardName) {
    missingFields.push(body.language === "pt" ? "cartao" : "card");
  }
  if (entryType === "unknown") {
    missingFields.push(body.language === "pt" ? "tipo" : "type");
  }

  const confidence = Math.max(
    0.2,
    Math.min(
      0.98,
      0.22 +
        (amount ? 0.28 : 0) +
        (entryType !== "unknown" ? 0.2 : 0) +
        (accountName || cardName ? 0.16 : 0) +
        (description ? 0.08 : 0) +
        (category ? 0.06 : 0),
    ),
  );

  return {
    entryType,
    amount,
    description,
    category,
    date,
    accountName,
    cardName,
    confidence,
    missingFields,
    source: "rules",
  };
}

async function parseWithOpenAI(body: Required<Pick<ParseRequestBody, "text" | "language" | "today" | "accounts" | "cards">>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract financial quick-add data. Return only JSON with keys: entryType, amount, description, category, date, accountName, cardName, confidence, missingFields. entryType must be income, expense, card_expense, or unknown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            utterance: body.text,
            language: body.language,
            today: body.today,
            availableAccounts: body.accounts,
            availableCards: body.cards,
          }),
        },
      ],
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  if (!rawContent) return null;

  try {
    const parsed = JSON.parse(rawContent) as Partial<ParseResult>;
    return {
      entryType:
        parsed.entryType === "income" ||
        parsed.entryType === "expense" ||
        parsed.entryType === "card_expense" ||
        parsed.entryType === "unknown"
          ? parsed.entryType
          : "unknown",
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      description: typeof parsed.description === "string" ? parsed.description : null,
      category: typeof parsed.category === "string" ? parsed.category : null,
      date: typeof parsed.date === "string" ? parsed.date : body.today,
      accountName: typeof parsed.accountName === "string" ? parsed.accountName : null,
      cardName: typeof parsed.cardName === "string" ? parsed.cardName : null,
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(parsed.confidence, 1))
          : 0.75,
      missingFields: Array.isArray(parsed.missingFields)
        ? parsed.missingFields.filter((item): item is string => typeof item === "string")
        : [],
      source: "ai" as const,
    };
  } catch {
    return null;
  }
}

type QuickAddParseInput = Required<
  Pick<ParseRequestBody, "text" | "language" | "today" | "accounts" | "cards">
>;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ParseRequestBody;
    const text = body.text?.trim();

    if (!text) {
      return NextResponse.json({ error: "missing_text" }, { status: 400 });
    }

    const input: QuickAddParseInput = {
      text,
      language: body.language === "en" ? "en" : "pt",
      today: body.today ?? toDateString(new Date()),
      accounts: Array.isArray(body.accounts) ? body.accounts : [],
      cards: Array.isArray(body.cards) ? body.cards : [],
    };

    const aiResult = await parseWithOpenAI(input);
    const result = aiResult ?? buildRuleBasedResult(input);

    return NextResponse.json({ result });
  } catch (error) {
    console.error("quick-add-parse error:", error);
    return NextResponse.json({ error: "parse_failed" }, { status: 500 });
  }
}
