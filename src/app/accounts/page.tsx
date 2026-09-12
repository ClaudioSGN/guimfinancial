"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/language";
import { useCurrency } from "@/lib/currency";
import { formatCentsFromNumber, formatCentsInput, parseCentsInput } from "@/lib/moneyInput";
import { useAuth } from "@/lib/auth";
import { hasMissingColumnError } from "@/lib/errorUtils";
import { BankBrandBadge, BankBrandPicker } from "@/components/BankBrandBadge";
import { DEFAULT_BANK_BRAND_CODE, type BankBrandCode } from "@/lib/bankBrands";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number | string;
  bank_code?: string | null;
};

export default function AccountsPage() {
  const { language, t } = useLanguage();
  const { currency } = useCurrency();
  const { user } = useAuth();
  const emptyMoneyValue = formatCentsInput("", currency);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [bankCode, setBankCode] = useState<BankBrandCode>(DEFAULT_BANK_BRAND_CODE);
  const [balance, setBalance] = useState(emptyMoneyValue);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editBankCode, setEditBankCode] = useState<BankBrandCode>(DEFAULT_BANK_BRAND_CODE);
  const [editBalance, setEditBalance] = useState(emptyMoneyValue);
  const [editSaving, setEditSaving] = useState(false);
  const typeOptions = [
    { label: "Conta poupanca", value: "Conta poupanca" },
    { label: "Conta corrente", value: "Conta corrente" },
  ];

  async function loadAccounts() {
    if (!user) return;
    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,type,balance,bank_code")
      .eq("user_id", user.id)
      .order("name", { ascending: true });
    if (!error) {
      setAccounts((data ?? []) as Account[]);
      return;
    }
    if (hasMissingColumnError(error, ["bank_code"])) {
      const fallback = await supabase
        .from("accounts")
        .select("id,name,type,balance")
        .eq("user_id", user.id)
        .order("name", { ascending: true });
      if (!fallback.error) {
        setAccounts((fallback.data ?? []) as Account[]);
      }
    }
  }

  useEffect(() => {
    loadAccounts();
  }, [user]);

  useEffect(() => {
    if (parseCentsInput(balance) === 0) {
      setBalance(emptyMoneyValue);
    }
    if (parseCentsInput(editBalance) === 0) {
      setEditBalance(emptyMoneyValue);
    }
  }, [balance, editBalance, emptyMoneyValue]);

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
    let { error } = await supabase.from("accounts").insert([
      {
        user_id: user.id,
        name: name.trim(),
        type: type.trim(),
        balance: parsedBalance,
        bank_code: bankCode,
      },
    ]);

    if (error && hasMissingColumnError(error, ["bank_code"])) {
      const legacy = await supabase.from("accounts").insert([
        {
          user_id: user.id,
          name: name.trim(),
          type: type.trim(),
          balance: parsedBalance,
        },
      ]);
      error = legacy.error;
    }

    if (error) {
      console.error("Supabase accounts insert error:", error);
      setErrorMsg(error.message || t("accounts.saveError"));
      setSaving(false);
      return;
    }

    setName("");
    setType("");
    setBankCode(DEFAULT_BANK_BRAND_CODE);
    setBalance(emptyMoneyValue);
    setSaving(false);
    loadAccounts();
    window.dispatchEvent(new Event("data-refresh"));
  }

  function openEdit(account: Account) {
    setEditing(account);
    setEditName(account.name);
    setEditType(account.type);
    setEditBankCode((account.bank_code as BankBrandCode | null) ?? DEFAULT_BANK_BRAND_CODE);
    setEditBalance(formatCentsFromNumber(Number(account.balance) || 0, currency));
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
    let { error } = await supabase
      .from("accounts")
      .update({
        name: editName.trim(),
        type: editType.trim(),
        balance: parsedBalance,
        bank_code: editBankCode,
      })
      .eq("id", editing.id)
      .eq("user_id", user.id);

    if (error && hasMissingColumnError(error, ["bank_code"])) {
      const legacy = await supabase
        .from("accounts")
        .update({
          name: editName.trim(),
          type: editType.trim(),
          balance: parsedBalance,
        })
        .eq("id", editing.id)
        .eq("user_id", user.id);
      error = legacy.error;
    }
    setEditSaving(false);

    if (error) {
      console.error("Supabase accounts update error:", error);
      setErrorMsg(error.message || t("accounts.saveError"));
      return;
    }

    setEditing(null);
    loadAccounts();
    window.dispatchEvent(new Event("data-refresh"));
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 text-[var(--text-1)] sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <Link href="/more" className="ui-btn ui-btn-secondary ui-btn-sm w-fit">
          ← {t("tabs.more")}
        </Link>

        <div className="py-2">
          <p className="ui-eyebrow">
            {t("accounts.title")}
          </p>
          <p className="mt-2 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.025em] sm:text-4xl text-[var(--text-1)]">
            {t("accounts.subtitle")}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-2)]">
            {language === "pt"
              ? "Cadastre onde seu dinheiro fica para que saldos, receitas e despesas conversem entre si."
              : "Register where your money lives so balances, income, and expenses stay connected."}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
        <div className="ui-card space-y-3 p-5">
          <p className="text-sm font-semibold text-[var(--text-1)]">
            {language === "pt" ? "Nova conta" : "New account"}
          </p>
          <BankBrandPicker selected={bankCode} onSelect={setBankCode} />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("accounts.namePlaceholder")}
            className="ui-input w-full px-4 py-3 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {typeOptions.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-3 text-sm ${
                  type === option.value
                    ? "border-[var(--text-1)] bg-[var(--surface-2)] text-[var(--text-1)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)]"
                }`}
              >
                <input
                  type="radio"
                  name="accountType"
                  value={option.value}
                  checked={type === option.value}
                  onChange={(event) => setType(event.target.value)}
                  className="h-4 w-4 accent-[var(--text-1)]"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <input
            value={balance}
            onChange={(event) => setBalance(formatCentsInput(event.target.value, currency))}
            placeholder={t("accounts.balancePlaceholder")}
            inputMode="decimal"
            pattern="[0-9.,]*"
            className="ui-input w-full px-4 py-3 text-sm"
          />
          {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="ui-btn ui-btn-primary ui-btn-lg w-full disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("accounts.add")}
          </button>
        </div>

        <div className="ui-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-1)]">{language === "pt" ? "Contas cadastradas" : "Registered accounts"}</p>
              <p className="text-xs text-[var(--text-3)]">{accounts.length} {language === "pt" ? "contas" : "accounts"}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
          {accounts.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 transition-colors hover:border-[var(--border-bright)]"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <BankBrandBadge bankCode={item.bank_code} />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--text-1)]">{item.name}</p>
                  <p className="text-xs text-[var(--text-3)]">{item.type}</p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {new Intl.NumberFormat(language === "pt" ? "pt-BR" : "en-US", {
                    style: "currency",
                    currency,
                  }).format(Number(item.balance) || 0)}
                </p>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  {t("common.edit")}
                </button>
              </div>
            </div>
          ))}
          </div>
        </div>
        </div>
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 px-4"
        >
          <div
            className="ui-card w-full max-w-md p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--text-1)]">{t("accounts.title")}</p>
              <button
                type="button"
                onClick={closeEdit}
                className="text-xs text-[var(--text-3)]"
              >
                {t("common.cancel")}
              </button>
            </div>
            <div className="space-y-3">
              <BankBrandPicker selected={editBankCode} onSelect={setEditBankCode} />
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder={t("accounts.namePlaceholder")}
                className="ui-input w-full px-4 py-3 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {typeOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-3 text-sm ${
                      editType === option.value
                        ? "border-[var(--text-1)] bg-[var(--surface-2)] text-[var(--text-1)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-3)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="editAccountType"
                      value={option.value}
                      checked={editType === option.value}
                      onChange={(event) => setEditType(event.target.value)}
                      className="h-4 w-4 accent-[var(--text-1)]"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <input
                value={editBalance}
                onChange={(event) => setEditBalance(formatCentsInput(event.target.value, currency))}
                placeholder={t("accounts.balancePlaceholder")}
                inputMode="numeric"
                pattern="[0-9]*"
                className="ui-input w-full px-4 py-3 text-sm"
              />
              {errorMsg ? <p className="text-xs text-[var(--red)]">{errorMsg}</p> : null}
              <button
                type="button"
                onClick={handleEditSave}
                disabled={editSaving}
                className="ui-btn ui-btn-primary w-full py-3 text-sm font-medium disabled:opacity-60"
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
