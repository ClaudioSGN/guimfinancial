export type BankBrandCode =
  | "nubank"
  | "itau"
  | "santander"
  | "mercado_pago"
  | "inter"
  | "banco_do_brasil"
  | "caixa"
  | "sicredi"
  | "bradesco"
  | "c6"
  | "btg"
  | "picpay"
  | "generic";

export type BankBrand = {
  code: BankBrandCode;
  label: string;
  shortLabel: string;
  textColor: string;
  background: string;
  border: string;
  logoUrl?: string;
  useSimpleIcon?: boolean;
};

export const BANK_BRANDS: BankBrand[] = [
  {
    code: "nubank",
    label: "Nubank",
    shortLabel: "NU",
    textColor: "#D8B4FE",
    background: "linear-gradient(135deg, #3B0764 0%, #6B21A8 100%)",
    border: "#7E22CE",
    useSimpleIcon: true,
  },
  {
    code: "itau",
    label: "Itau",
    shortLabel: "IT",
    textColor: "#FFF4CC",
    background: "linear-gradient(135deg, #F97316 0%, #1D4ED8 100%)",
    border: "#FB923C",
    logoUrl: "https://www.google.com/s2/favicons?domain=itau.com.br&sz=128",
  },
  {
    code: "santander",
    label: "Santander",
    shortLabel: "SAN",
    textColor: "#FEE2E2",
    background: "linear-gradient(135deg, #991B1B 0%, #DC2626 100%)",
    border: "#EF4444",
    logoUrl: "https://www.google.com/s2/favicons?domain=santander.com.br&sz=128",
  },
  {
    code: "mercado_pago",
    label: "Mercado Pago",
    shortLabel: "MP",
    textColor: "#E0F2FE",
    background: "linear-gradient(135deg, #0EA5E9 0%, #1D4ED8 100%)",
    border: "#38BDF8",
    logoUrl: "/mercado-pago-symbol.svg",
  },
  {
    code: "inter",
    label: "Inter",
    shortLabel: "IN",
    textColor: "#FFEDD5",
    background: "linear-gradient(135deg, #C2410C 0%, #F97316 100%)",
    border: "#FB923C",
    logoUrl: "/inter-official.svg",
  },
  {
    code: "banco_do_brasil",
    label: "Banco do Brasil",
    shortLabel: "BB",
    textColor: "#FEF3C7",
    background: "linear-gradient(135deg, #1D4ED8 0%, #FACC15 100%)",
    border: "#FACC15",
    logoUrl: "https://www.google.com/s2/favicons?domain=bb.com.br&sz=128",
  },
  {
    code: "caixa",
    label: "Caixa",
    shortLabel: "CX",
    textColor: "#DBEAFE",
    background: "linear-gradient(135deg, #1D4ED8 0%, #F97316 100%)",
    border: "#60A5FA",
    logoUrl: "https://www.google.com/s2/favicons?domain=caixa.gov.br&sz=128",
  },
  {
    code: "sicredi",
    label: "Sicredi",
    shortLabel: "SI",
    textColor: "#DCFCE7",
    background: "linear-gradient(135deg, #166534 0%, #22C55E 100%)",
    border: "#4ADE80",
    logoUrl: "https://www.google.com/s2/favicons?domain=sicredi.com.br&sz=128",
  },
  {
    code: "bradesco",
    label: "Bradesco",
    shortLabel: "BRA",
    textColor: "#FFE4E6",
    background: "linear-gradient(135deg, #881337 0%, #E11D48 100%)",
    border: "#FB7185",
    logoUrl: "https://www.google.com/s2/favicons?domain=bradesco.com.br&sz=128",
  },
  {
    code: "c6",
    label: "C6 Bank",
    shortLabel: "C6",
    textColor: "#F3F4F6",
    background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
    border: "#6B7280",
    logoUrl: "https://www.google.com/s2/favicons?domain=c6bank.com.br&sz=128",
  },
  {
    code: "btg",
    label: "BTG",
    shortLabel: "BTG",
    textColor: "#E0F2FE",
    background: "linear-gradient(135deg, #0F172A 0%, #1D4ED8 100%)",
    border: "#60A5FA",
    logoUrl: "https://www.google.com/s2/favicons?domain=btgpactual.com&sz=128",
  },
  {
    code: "picpay",
    label: "PicPay",
    shortLabel: "PP",
    textColor: "#DCFCE7",
    background: "linear-gradient(135deg, #166534 0%, #22C55E 100%)",
    border: "#4ADE80",
    useSimpleIcon: true,
  },
  {
    code: "generic",
    label: "Outro banco",
    shortLabel: "BK",
    textColor: "#E5E7EB",
    background: "linear-gradient(135deg, #334155 0%, #0F172A 100%)",
    border: "#64748B",
  },
];

export const DEFAULT_BANK_BRAND_CODE: BankBrandCode = "generic";

export function getBankBrand(code?: string | null) {
  return BANK_BRANDS.find((brand) => brand.code === code) ??
    BANK_BRANDS.find((brand) => brand.code === DEFAULT_BANK_BRAND_CODE)!;
}
