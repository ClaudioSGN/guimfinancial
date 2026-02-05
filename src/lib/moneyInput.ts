export function formatCentsInput(raw: string) {
  const cleaned = raw.replace(/\D/g, "");
  if (!cleaned) return "R$ 0";
  const value = Number(cleaned) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseCentsInput(value: string) {
  const cleaned = value.replace(/\D/g, "");
  if (!cleaned) return 0;
  return Number(cleaned) / 100;
}

export function formatCentsFromNumber(value: number) {
  const cents = Math.round((Number(value) || 0) * 100);
  return formatCentsInput(String(cents));
}
