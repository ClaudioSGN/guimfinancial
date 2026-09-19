"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { BANK_BRANDS, getBankBrand, type BankBrandCode } from "@/lib/bankBrands";
import { BankBrandBadge } from "./BankBrandBadge";

type PickerProps = {
  selected: BankBrandCode;
  onSelect: (code: BankBrandCode) => void;
};

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
      <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-3)]">
        Banco
      </p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-full border px-4 py-3 text-left transition ${
          open
            ? "border-[var(--text-1)] bg-[var(--surface-2)]"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border)]"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex items-center gap-4">
          <BankBrandBadge bankCode={selectedBrand.code} size="sm" />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-[var(--text-1)]">{selectedBrand.label}</span>
            <span className="block text-xs text-[var(--text-3)]">
              {open ? "Escolha um banco" : "Banco selecionado"}
            </span>
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="text-lg leading-none text-[var(--text-3)]"
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
                    className={`flex items-center gap-4 rounded-full border px-4 py-3 text-left transition ${
                      active
                        ? "border-[var(--text-1)] bg-[var(--surface-2)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border)]"
                    }`}
                    role="option"
                    aria-selected={active}
                  >
                    <BankBrandBadge bankCode={brand.code} size="sm" />
                    <span className={`text-sm ${active ? "text-[var(--text-1)]" : "text-[var(--text-3)]"}`}>
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
