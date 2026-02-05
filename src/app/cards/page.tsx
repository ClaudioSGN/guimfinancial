"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";

type Card = {
  id: string;
  name: string;
  limit_amount: number | string;
  closing_day: number;
  due_day: number;
};

function formatCentsInput(digits: string) {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return "R$ 0";
  const value = Number(cleaned) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseCentsInput(value: string) {
  const cleaned = value.replace(/\D/g, "");
  if (!cleaned) return 0;
  return Number(cleaned) / 100;
}

export default function CardsPage() {
  const { language, t } = useLanguage();
  const [cards, setCards] = useState<Card[]>([]);
  const [name, setName] = useState("");
  const [limitAmount, setLimitAmount] = useState("R$ 0");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [editName, setEditName] = useState("");
  const [editLimitAmount, setEditLimitAmount] = useState("R$ 0");
  const [editClosingDay, setEditClosingDay] = useState("");
  const [editDueDay, setEditDueDay] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadCards() {
    const { data, error } = await supabase
      .from("credit_cards")
      .select("id,name,limit_amount,closing_day,due_day")
      .order("name", { ascending: true });
    if (!error) {
      setCards((data ?? []) as Card[]);
    }
  }

  useEffect(() => {
    loadCards();
  }, []);

  async function handleAdd() {
    setErrorMsg(null);
    const parsedLimit = parseCentsInput(limitAmount);
    const parsedClosing = Number(closingDay);
    const parsedDue = Number(dueDay);

    if (!name.trim()) {
      setErrorMsg(t("cards.nameError"));
      return;
    }
    if (!Number.isFinite(parsedLimit) || !Number.isFinite(parsedClosing) || !Number.isFinite(parsedDue)) {
      setErrorMsg(t("cards.dataError"));
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("credit_cards").insert([
      {
        name: name.trim(),
        limit_amount: parsedLimit,
        closing_day: parsedClosing,
        due_day: parsedDue,
      },
    ]);

    if (error) {
      setErrorMsg(t("cards.saveError"));
      setSaving(false);
      return;
    }

    setName("");
    setLimitAmount("R$ 0");
    setClosingDay("");
    setDueDay("");
    setSaving(false);
    loadCards();
    window.dispatchEvent(new Event("data-refresh"));
  }

  function openEdit(card: Card) {
    setEditing(card);
    setEditName(card.name);
    setEditLimitAmount(
      formatCentsInput(String(Math.round((Number(card.limit_amount) || 0) * 100))),
    );
    setEditClosingDay(String(card.closing_day ?? ""));
    setEditDueDay(String(card.due_day ?? ""));
    setErrorMsg(null);
  }

  function closeEdit() {
    if (editSaving) return;
    setEditing(null);
  }

  async function handleEditSave() {
    if (!editing) return;
    setErrorMsg(null);
    const parsedLimit = parseCentsInput(editLimitAmount);
    const parsedClosing = Number(editClosingDay);
    const parsedDue = Number(editDueDay);

    if (!editName.trim()) {
      setErrorMsg(t("cards.nameError"));
      return;
    }
    if (!Number.isFinite(parsedLimit) || !Number.isFinite(parsedClosing) || !Number.isFinite(parsedDue)) {
      setErrorMsg(t("cards.dataError"));
      return;
    }

    setEditSaving(true);
    const { error } = await supabase
      .from("credit_cards")
      .update({
        name: editName.trim(),
        limit_amount: parsedLimit,
        closing_day: parsedClosing,
        due_day: parsedDue,
      })
      .eq("id", editing.id);
    setEditSaving(false);

    if (error) {
      setErrorMsg(t("cards.saveError"));
      return;
    }

    setEditing(null);
    loadCards();
    window.dispatchEvent(new Event("data-refresh"));
  }

  async function handleRemove(card: Card) {
    const ok = window.confirm(
      `Remover o cartao "${card.name}"?`,
    );
    if (!ok) return;
    if (deletingId) return;

    setDeletingId(card.id);
    const { error } = await supabase
      .from("credit_cards")
      .delete()
      .eq("id", card.id);
    setDeletingId(null);

    if (error) {
      console.error(error);
      setErrorMsg(t("cards.removeError"));
      return;
    }

    loadCards();
    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] px-6 py-6 text-slate-50">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <Link href="/more" className="text-xs text-[#9CA3AF]">
          ← {t("tabs.more")}
        </Link>

        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#7F8694]">
            {t("cards.title")}
          </p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {t("cards.subtitle")}
          </p>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("cards.namePlaceholder")}
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          <input
            value={limitAmount}
            onChange={(event) => setLimitAmount(formatCentsInput(event.target.value))}
            placeholder={t("cards.limitPlaceholder")}
            inputMode="decimal"
            pattern="[0-9.,]*"
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          <input
            value={closingDay}
            onChange={(event) => setClosingDay(event.target.value)}
            placeholder={t("cards.closingDayPlaceholder")}
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          <input
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            placeholder={t("cards.dueDayPlaceholder")}
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("cards.add")}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {cards.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-[#1E232E] bg-[#121621] p-4"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#E4E7EC]">{item.name}</p>
                <p className="text-xs text-[#8A93A3]">
                  {t("cards.closes")} {item.closing_day} · {t("cards.due")} {item.due_day}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-[#C7CEDA]">
                  {new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
                    style: "currency",
                    currency: "BRL",
                  }).format(Number(item.limit_amount) || 0)}
                </p>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-xs text-[#8B94A6] hover:border-[#5DD6C7]/60 hover:text-[#5DD6C7]"
                >
                  {t("common.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  disabled={deletingId === item.id}
                  className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-xs text-[#8B94A6] hover:border-red-500/60 hover:text-red-400 disabled:opacity-60"
                >
                  {deletingId === item.id ? t("common.saving") : t("cards.remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#1E232E] bg-[#121621] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#E5E8EF]">{t("cards.title")}</p>
              <button
                type="button"
                onClick={closeEdit}
                className="text-xs text-[#8B94A6]"
              >
                {t("common.cancel")}
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder={t("cards.namePlaceholder")}
                className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
              />
              <input
                value={editLimitAmount}
                onChange={(event) => setEditLimitAmount(formatCentsInput(event.target.value))}
                placeholder={t("cards.limitPlaceholder")}
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
              />
              <input
                value={editClosingDay}
                onChange={(event) => setEditClosingDay(event.target.value)}
                placeholder={t("cards.closingDayPlaceholder")}
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
              />
              <input
                value={editDueDay}
                onChange={(event) => setEditDueDay(event.target.value)}
                placeholder={t("cards.dueDayPlaceholder")}
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
              />
              {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
              <button
                type="button"
                onClick={handleEditSave}
                disabled={editSaving}
                className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
              >
                {editSaving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
