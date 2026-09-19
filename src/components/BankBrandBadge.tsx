"use client";

import { siMercadopago, siNubank, siPicpay, type SimpleIcon } from "simple-icons";
import { getBankBrand, type BankBrandCode } from "@/lib/bankBrands";

type BadgeProps = {
  bankCode?: string | null;
  size?: "sm" | "md" | "lg";
};

const iconByCode: Partial<Record<BankBrandCode, SimpleIcon>> = {
  mercado_pago: siMercadopago,
  nubank: siNubank,
  picpay: siPicpay,
};

export function BankBrandBadge({ bankCode, size = "md" }: BadgeProps) {
  const brand = getBankBrand(bankCode);
  const simpleIcon = brand.useSimpleIcon ? iconByCode[brand.code] : undefined;
  const hasImageLogo = Boolean(brand.logoUrl);
  const hasRealLogo = Boolean(simpleIcon || hasImageLogo);
  const fallbackDimensions =
    size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-12 w-12 text-sm" : "h-10 w-10 text-xs";
  const logoDimensions =
    size === "sm"
      ? "h-8 min-w-[2.75rem] max-w-[2.75rem]"
      : size === "lg"
        ? "h-12 min-w-[3.5rem] max-w-[3.5rem]"
        : "h-10 min-w-[3rem] max-w-[3rem]";

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-semibold uppercase tracking-[0.05em] ${
        hasRealLogo ? logoDimensions : `overflow-hidden rounded-full ${fallbackDimensions}`
      }`}
      style={{
        color: "var(--text-1)",
        background: hasRealLogo ? "transparent" : "var(--surface-3)",
        border: hasRealLogo ? "none" : "1px solid var(--border)",
      }}
      aria-label={brand.label}
      title={brand.label}
    >
      {simpleIcon ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="block h-full w-full"
          fill="currentColor"
        >
          <path d={simpleIcon.path} />
        </svg>
      ) : null}
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoUrl}
          alt={brand.label}
          className="block h-full w-auto max-w-full object-contain grayscale"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      ) : null}
      <span
        className={`${hasRealLogo ? "hidden" : "flex"} h-full w-full items-center justify-center`}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-1)]">
          {brand.shortLabel}
        </span>
      </span>
    </div>
  );
}
