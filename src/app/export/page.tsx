"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";

export default function ExportPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
        <Link href="/more" className="text-xs text-[#9CA3AF]">
          ← {t("tabs.more")}
        </Link>

        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            {t("export.reports")}
          </p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {t("export.title")}
          </p>
          <p className="text-sm text-[#9CA3AF]">{t("export.subtitle")}</p>
        </div>
      </div>
    </div>
  );
}
