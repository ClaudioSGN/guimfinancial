"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { useAuth } from "@/lib/auth";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number | string;
};

export default function AccountsPage() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [balance, setBalance] = useState("R$ 0");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editBalance, setEditBalance] = useState("R$ 0");
  const [editSaving, setEditSaving] = useState(false);
  const typeOptions = [
    { label: "Conta poupanca", value: "Conta poupanca" },
    { label: "Conta corrente", value: "Conta corrente" },
  ];

  async function loadAccounts() {
    if (!user) return;
    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,type,balance")
      .eq("user_id", user.id)
      .order("name", { ascending: true });
    if (!error) {
      setAccounts((data ?? []) as Account[]);
    }
  }

  useEffect(() => {
    loadAccounts();
  }, [user]);

  async function handleAdd() {
    if (!user) return;
    setErrorMsg(null);
    const parsedBalance = parseCentsInput(balance);
    if (!name.trim() || !type.trim()) {
      setErrorMsg(t("accounts.nameTypeError"));
      return;
    }

    if (!Number.isFinite(parsedBalance)) {
      setErrorMsg(t("accounts.balanceError"));
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("accounts").insert([
      {
        user_id: user.id,
        name: name.trim(),
        type: type.trim(),
        balance: parsedBalance,
      },
    ]);

    if (error) {
      setErrorMsg(t("accounts.saveError"));
      setSaving(false);
      return;
    }

    setName("");
    setType("");
    setBalance("R$ 0");
    setSaving(false);
    loadAccounts();
    window.dispatchEvent(new Event("data-refresh"));
  }

  function openEdit(account: Account) {
    setEditing(account);
    setEditName(account.name);
    setEditType(account.type);
    setEditBalance(formatCentsFromNumber(Number(account.balance) || 0));
    setErrorMsg(null);
  }

  function closeEdit() {
    if (editSaving) return;
    setEditing(null);
  }

  async function handleEditSave() {
    if (!editing) return;
    if (!user) return;
    setErrorMsg(null);
    const parsedBalance = parseCentsInput(editBalance);
    if (!editName.trim() || !editType.trim()) {
      setErrorMsg(t("accounts.nameTypeError"));
      return;
    }
    if (!Number.isFinite(parsedBalance)) {
      setErrorMsg(t("accounts.balanceError"));
      return;
    }

    setEditSaving(true);
    const { error } = await supabase
      .from("accounts")
      .update({
        name: editName.trim(),
        type: editType.trim(),
        balance: parsedBalance,
      })
      .eq("id", editing.id)
      .eq("user_id", user.id);
    setEditSaving(false);

    if (error) {
      setErrorMsg(t("accounts.saveError"));
      return;
    }

    setEditing(null);
    loadAccounts();
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
            {t("accounts.title")}
          </p>
          <p className="text-2xl font-semibold text-[#E5E8EF]">
            {t("accounts.subtitle")}
          </p>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("accounts.namePlaceholder")}
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {typeOptions.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                  type === option.value
                    ? "border-[#5DD6C7] bg-[#0F141E] text-[#E4E7EC]"
                    : "border-[#1E232E] bg-[#121621] text-[#8B94A6]"
                }`}
              >
                <input
                  type="radio"
                  name="accountType"
                  value={option.value}
                  checked={type === option.value}
                  onChange={(event) => setType(event.target.value)}
                  className="h-4 w-4 accent-[#5DD6C7]"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <input
            value={balance}
            onChange={(event) => setBalance(formatCentsInput(event.target.value))}
            placeholder={t("accounts.balancePlaceholder")}
            inputMode="decimal"
            pattern="[0-9.,]*"
            className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
          />
          {errorMsg ? <p className="text-xs text-red-400">{errorMsg}</p> : null}
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="w-full rounded-xl bg-[#E6EDF3] py-3 text-sm font-semibold text-[#0C1018] disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("accounts.add")}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {accounts.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-[#1E232E] bg-[#121621] p-4"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#E4E7EC]">{item.name}</p>
                <p className="text-xs text-[#8A93A3]">{item.type}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-[#C7CEDA]">
                  {new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
                    style: "currency",
                    currency: "BRL",
                  }).format(Number(item.balance) || 0)}
                </p>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="rounded-full border border-[#2A3140] bg-[#0F141E] px-3 py-1 text-xs text-[#8B94A6] hover:border-[#5DD6C7]/60 hover:text-[#5DD6C7]"
                >
                  {t("common.edit")}
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
              <p className="text-sm font-semibold text-[#E5E8EF]">{t("accounts.title")}</p>
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
                placeholder={t("accounts.namePlaceholder")}
                className="w-full rounded-xl border border-[#1E232E] bg-[#121621] px-4 py-3 text-sm text-[#E4E7EC]"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {typeOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                      editType === option.value
                        ? "border-[#5DD6C7] bg-[#0F141E] text-[#E4E7EC]"
                        : "border-[#1E232E] bg-[#121621] text-[#8B94A6]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="editAccountType"
                      value={option.value}
                      checked={editType === option.value}
                      onChange={(event) => setEditType(event.target.value)}
                      className="h-4 w-4 accent-[#5DD6C7]"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <input
                value={editBalance}
                onChange={(event) => setEditBalance(formatCentsInput(event.target.value))}
                placeholder={t("accounts.balancePlaceholder")}
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
