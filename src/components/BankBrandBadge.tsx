"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { siMercadopago, siNubank, siPicpay, type SimpleIcon } from "simple-icons";
import { BANK_BRANDS, getBankBrand, type BankBrandCode } from "@/lib/bankBrands";

type BadgeProps = {
  bankCode?: string | null;
  size?: "sm" | "md" | "lg";
};

type PickerProps = {
  selected: BankBrandCode;
  onSelect: (code: BankBrandCode) => void;
};

export function BankBrandBadge({ bankCode, size = "md" }: BadgeProps) {
  const brand = getBankBrand(bankCode);
  const iconByCode: Partial<Record<BankBrandCode, SimpleIcon>> = {
    mercado_pago: siMercadopago,
    nubank: siNubank,
    picpay: siPicpay,
  };
  const simpleIcon = brand.useSimpleIcon ? iconByCode[brand.code] : undefined;
  const hasImageLogo = Boolean(brand.logoUrl);
  const hasRealLogo = Boolean(simpleIcon || hasImageLogo);
  const fallbackDimensions =
    size === "sm" ? "h-8 w-8 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-10 w-10 text-xs";
  const logoDimensions =
    size === "sm"
      ? "h-8 min-w-[2.75rem] max-w-[2.75rem]"
      : size === "lg"
        ? "h-12 min-w-[3.5rem] max-w-[3.5rem]"
        : "h-10 min-w-[3rem] max-w-[3rem]";

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-semibold uppercase tracking-[0.12em] ${
        hasRealLogo ? logoDimensions : `overflow-hidden rounded-full ${fallbackDimensions}`
      }`}
      style={{
        color: brand.textColor,
        background: hasRealLogo ? "transparent" : brand.background,
        border: hasRealLogo ? "none" : `1px solid ${brand.border}`,
      }}
      aria-label={brand.label}
      title={brand.label}
    >
      {simpleIcon ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="block h-full w-full"
          fill={simpleIcon.hex ? `#${simpleIcon.hex}` : "currentColor"}
        >
          <path d={simpleIcon.path} />
        </svg>
      ) : null}
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoUrl}
          alt={brand.label}
          className="block h-full w-auto max-w-full object-contain"
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
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#111827]">
          {brand.shortLabel}
        </span>
      </span>
    </div>
  );
}

export function BankBrandPicker({ selected, onSelect }: PickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedBrand = useMemo(() => getBankBrand(selected), [selected]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8B94A6]">
        Banco
      </p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
          open
            ? "border-[#5DD6C7] bg-[#0F141E]"
            : "border-[#1E232E] bg-[#121621] hover:border-[#2E3B50]"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-4">
          <BankBrandBadge bankCode={selectedBrand.code} size="sm" />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-[#E4E7EC]">{selectedBrand.label}</span>
            <span className="block text-xs text-[#8B94A6]">
              {open ? "Escolha um banco" : "Banco selecionado"}
            </span>
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="text-lg leading-none text-[#8B94A6]"
          aria-hidden="true"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={{
                open: {
                  transition: {
                    staggerChildren: 0.04,
                    delayChildren: 0.02,
                  },
                },
                closed: {
                  transition: {
                    staggerChildren: 0.02,
                    staggerDirection: -1,
                  },
                },
              }}
              className="grid gap-2 pt-1 sm:grid-cols-2"
              role="listbox"
            >
              {BANK_BRANDS.map((brand) => {
                const active = selected === brand.code;
                return (
                  <motion.button
                    key={brand.code}
                    type="button"
                    onClick={() => {
                      onSelect(brand.code);
                      setOpen(false);
                    }}
                    variants={{
                      open: { opacity: 1, y: 0, scale: 1 },
                      closed: { opacity: 0, y: -8, scale: 0.98 },
                    }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-[#5DD6C7] bg-[#0F141E]"
                        : "border-[#1E232E] bg-[#121621] hover:border-[#2E3B50]"
                    }`}
                    role="option"
                    aria-selected={active}
                  >
                    <BankBrandBadge bankCode={brand.code} size="sm" />
                    <span className={`text-sm ${active ? "text-[#E4E7EC]" : "text-[#A8B2C3]"}`}>
                      {brand.label}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
