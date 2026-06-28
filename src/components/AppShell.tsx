"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { NotificationsPanel } from "@/components/social/NotificationsPanel";
import { NewEntryScreen } from "@/components/screens/NewEntryScreen";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { loadProfileSettings, type ProfileSettings } from "@/lib/profile";

type TabKey = "home" | "transactions" | "budget" | "investments" | "more";

type Props = {
  activeTab: TabKey;
  children: ReactNode;
};

export function AppShell({ activeTab, children }: Props) {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeModalType, setActiveModalType] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileSettings>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const investmentEntryCounter = useRef(0);
  const notificationsLabel = language === "en" ? "Notifications" : "Notificações";

  const userName =
    profile.name?.trim()
      ? profile.name.trim()
      : typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()
      ? user.user_metadata.name.trim()
      : user?.email?.split("@")[0] ?? "Guim";

  const userInitials =
    userName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GF";
  const metadataAvatar =
    typeof user?.user_metadata?.avatar_url === "string" &&
    user.user_metadata.avatar_url.trim() &&
    !user.user_metadata.avatar_url.startsWith("data:") &&
    user.user_metadata.avatar_url.length <= 2048
      ? user.user_metadata.avatar_url.trim()
      : "";
  const avatarSrc = profile.avatarUrl?.trim() || metadataAvatar;

  const menuItems = useMemo(
    () =>
      [
        {
          key: "income",
          label: t("newEntry.income"),
          description: language === "pt" ? "Dinheiro entrando em uma conta" : "Money entering an account",
          icon: "arrow-up",
          color: "#19d28f",
        },
        {
          key: "expense",
          label: t("newEntry.expense"),
          description: language === "pt" ? "Despesa paga direto da conta" : "Expense paid from an account",
          icon: "arrow-down",
          color: "#ff5d5d",
        },
        {
          key: "card_expense",
          label: t("newEntry.cardExpense"),
          description: language === "pt" ? "Compra em cartão próprio ou de amigo" : "Purchase on your card or a friend's",
          icon: "credit-card",
          color: "#f5b51b",
        },
        {
          key: "share_with_friend",
          label: language === "en" ? "Assign to friends" : "Atribuir a amigos",
          description: language === "pt" ? "Envie uma cobrança para outro usuário" : "Send a charge to another user",
          icon: "arrow-right",
          color: "#38bdf8",
        },
        {
          key: "transfer",
          label: t("newEntry.transfer"),
          description: language === "pt" ? "Mover saldo entre contas" : "Move balance between accounts",
          icon: "transfer",
          color: "#9b8cff",
        },
        {
          key: "investment",
          label: t("investments.newInvestment"),
          description: language === "pt" ? "Registrar ativo na carteira" : "Register an asset in the portfolio",
          icon: "wallet",
          color: "#7dd3fc",
        },
      ] as const,
    [language, t],
  );

  const desktopNavItems = [
    { href: "/", key: "home", icon: "house", label: t("tabs.home") },
    { href: "/transactions", key: "transactions", icon: "list", label: t("tabs.transactions") },
    { href: "/budget", key: "budget", icon: "wallet", label: t("tabs.budget") },
    { href: "/investments", key: "investments", icon: "calendar", label: t("tabs.investments") },
    { href: "/more", key: "more", icon: "more", label: t("tabs.more") },
  ] as const;

  const mobileNavItems = [
    { href: "/", key: "home", icon: "house", label: t("tabs.home") },
    { href: "/transactions", key: "transactions", icon: "list", label: t("tabs.transactions") },
    { href: "/investments", key: "investments", icon: "calendar", label: t("tabs.investments") },
    { href: "/more", key: "more", icon: "more", label: t("tabs.more") },
  ] as const;

  const activeNavItem = desktopNavItems.find((item) => item.key === activeTab) ?? desktopNavItems[0];
  const mobileActiveTab: Exclude<TabKey, "budget"> = activeTab === "budget" ? "more" : activeTab;

  const pageSubtitles: Record<TabKey, string> = {
    home:
      language === "pt"
        ? "Comece pelo saldo, veja o que pesa no mês e aja pelo botão Registrar."
        : "Start with balance, see what weighs on the month, and act through Register.",
    transactions:
      language === "pt"
        ? "Filtre, confira cartões de amigos e ajuste movimentações sem sair da lista."
        : "Filter, check friend cards, and adjust movements without leaving the list.",
    budget:
      language === "pt"
        ? "Transforme categorias em limites simples e acompanhe o espaço restante."
        : "Turn categories into simple limits and track remaining room.",
    investments:
      language === "pt"
        ? "Sua carteira organizada por ativo, indicadores e valor total."
        : "Your portfolio organized by asset, indicators, and total value.",
    more:
      language === "pt"
        ? "Ajustes, contas, cartões, amigos e preferências do produto."
        : "Settings, accounts, cards, friends, and product preferences.",
  };

  useEffect(() => {
    let timeoutId: number | undefined;
    if (menuOpen) {
      timeoutId = window.setTimeout(() => setMenuVisible(true), 0);
    } else if (menuVisible) {
      timeoutId = window.setTimeout(() => setMenuVisible(false), 180);
    }
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [menuOpen, menuVisible]);

  useEffect(() => {
    setProfile(loadProfileSettings());
    function handleProfileUpdate() {
      setProfile(loadProfileSettings());
    }

    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const root = document.documentElement;
    const body = document.body;

    const applyViewportLock = () => {
      if (media.matches) {
        root.style.height = "100%";
        body.style.height = "100%";
        body.style.overflow = "hidden";
      } else {
        root.style.height = "";
        body.style.height = "";
        body.style.overflow = "";
      }
    };

    applyViewportLock();
    media.addEventListener("change", applyViewportLock);

    return () => {
      media.removeEventListener("change", applyViewportLock);
      root.style.height = "";
      body.style.height = "";
      body.style.overflow = "";
    };
  }, []);

  function openNewEntry(type: string) {
    if (type === "investment") {
      investmentEntryCounter.current += 1;
      router.push(`/investments?new=${investmentEntryCounter.current}`);
      setMenuOpen(false);
      return;
    }
    setActiveModalType(type);
    setMenuOpen(false);
  }

  return (
    <div className="app-shell min-h-screen overflow-hidden md:overflow-visible">
      <header className="site-topbar fixed left-0 right-0 top-0 z-40 hidden border-b border-[var(--border)] md:block">
        <div className="mx-auto grid h-[76px] max-w-[1880px] grid-cols-[260px_1fr_auto] items-center gap-5 px-6 xl:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center border border-[var(--border-bright)] bg-[var(--accent)] text-sm font-black text-white shadow-[6px_6px_0_rgba(20,184,166,0.24)]">
              GF
            </span>
            <span className="min-w-0">
              <span className="block font-[var(--font-display)] text-lg font-black uppercase tracking-[-0.04em] text-[var(--text-1)]">
                GuimFinancial
              </span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-3)]">
                {language === "pt" ? "Painel financeiro" : "Finance board"}
              </span>
            </span>
          </Link>

          <nav className="flex min-w-0 items-center justify-center gap-1">
            {desktopNavItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`site-nav-item ${isActive ? "site-nav-item-active" : ""}`}
                >
                  <AppIcon name={item.icon} size={17} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="site-action-button"
              title={notificationsLabel}
            >
              <AppIcon name="bell" size={17} />
              <span>{notificationsLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="site-primary-button"
            >
              <AppIcon name="plus" size={17} color="#041016" />
              <span>{language === "pt" ? "Registrar" : "Register"}</span>
            </button>
            <Link href="/profile" className="ml-2 flex h-11 items-center gap-3 border-l border-[var(--border)] pl-4 transition-opacity hover:opacity-85">
              <div className="text-right">
                <p className="max-w-[150px] truncate text-xs font-bold text-[var(--text-1)]">{userName}</p>
                <p className="max-w-[150px] truncate text-[11px] text-[var(--text-3)]">{user?.email}</p>
              </div>
              <div className="grid h-10 w-10 place-items-center overflow-hidden border border-[var(--border-bright)] bg-[var(--surface-3)] text-xs font-black text-[var(--text-1)]">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  userInitials
                )}
              </div>
            </Link>
          </div>
        </div>
      </header>

      <div className="h-[100dvh] md:h-auto md:min-h-screen md:pt-[76px]">
        <div
          className="h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] overflow-y-auto overscroll-y-none px-3 pb-4 pt-4 sm:px-4 md:h-auto md:min-h-[calc(100vh-76px)] md:overflow-visible md:px-6 md:pb-10 md:pt-6 xl:px-8"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          <section className="page-command-strip mx-auto mb-6 hidden max-w-[1880px] grid-cols-[minmax(0,1fr)_360px] gap-4 md:grid">
            <div className="page-title-panel">
              <div className="flex items-center gap-3">
                <span className="page-kicker">{language === "pt" ? "Você está em" : "You are in"}</span>
                <span className="page-current">{activeNavItem.label}</span>
              </div>
              <h1>{activeNavItem.label}</h1>
              <p>{pageSubtitles[activeTab]}</p>
            </div>
            <aside className="page-help-panel">
              <p className="page-kicker">{language === "pt" ? "Como usar rápido" : "Quick use"}</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">
                {language === "pt"
                  ? "Use Registrar para adicionar receitas, despesas, cartão ou atribuições sem procurar por menus."
                  : "Use Register to add income, expenses, cards, or friend assignments without hunting menus."}
              </p>
            </aside>
          </section>

          <main className="mx-auto w-full max-w-[1880px]">{children}</main>
        </div>
      </div>

      <nav className="nav-bar fixed bottom-0 left-0 right-0 z-40 md:hidden">
        <div className="flex w-full items-center justify-around gap-1 px-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 xs:px-2">
          {mobileNavItems.slice(0, 2).map((item) => {
            const isActive = mobileActiveTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-all ${
                  isActive
                    ? "bg-[rgba(79,142,255,0.18)] text-[var(--text-1)]"
                    : "text-[var(--text-3)]"
                }`}
              >
                <span className={`absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 transition-opacity ${isActive ? "bg-[var(--accent)] opacity-100" : "opacity-0"}`} />
                <span className="flex h-9 w-9 items-center justify-center">
                  <AppIcon name={item.icon} size={20} />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] shadow-[0_6px_20px_rgba(79,142,255,0.4)] transition-transform active:scale-95"
          >
            <div className={`transition-transform duration-200 ${menuOpen ? "rotate-45" : "rotate-0"}`}>
              <AppIcon name="plus" size={22} color="#fff" />
            </div>
          </button>

          {mobileNavItems.slice(2).map((item) => {
            const isActive = mobileActiveTab === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-all ${
                  isActive
                    ? "bg-[rgba(79,142,255,0.18)] text-[var(--text-1)]"
                    : "text-[var(--text-3)]"
                }`}
              >
                <span className={`absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 transition-opacity ${isActive ? "bg-[var(--accent)] opacity-100" : "opacity-0"}`} />
                <span className="flex h-9 w-9 items-center justify-center">
                  <AppIcon name={item.icon} size={20} />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {activeModalType ? (
        <div
          className="ui-modal-backdrop fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setActiveModalType(null)}
        >
          <div
            className="ui-card-2 ui-slide-up relative mx-2 w-[min(100%,42rem)] overflow-y-auto px-4 pb-4 pt-3 sm:mx-4 sm:px-5 sm:pb-5 sm:pt-4"
            style={{
              maxHeight: "min(92dvh, 820px)",
              paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 1rem))",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveModalType(null)}
              className="absolute right-3 top-3 z-10 px-2.5 py-1.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] sm:right-4 sm:top-4"
            >
              {language === "pt" ? "Fechar" : "Close"}
            </button>
            <NewEntryScreen entryType={activeModalType} onClose={() => setActiveModalType(null)} />
          </div>
        </div>
      ) : null}

      {notificationsOpen ? (
        <div
          className="ui-modal-backdrop fixed inset-0 z-50 hidden md:block"
          onClick={() => setNotificationsOpen(false)}
        >
          <div
            className="absolute right-8 top-24 w-[min(560px,calc(100vw-4rem))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ui-card-2 max-h-[calc(100dvh-8rem)] overflow-y-auto p-5 shadow-[var(--shadow-lg)]">
              <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
                <div>
                  <p className="page-kicker">{notificationsLabel}</p>
                  <p className="mt-1 text-lg font-black text-[var(--text-1)]">
                  {language === "pt" ? "Caixa de entrada" : "Inbox"}
                  </p>
                </div>
                <button type="button" onClick={() => setNotificationsOpen(false)} className="ui-btn ui-btn-ghost ui-btn-sm">
                  {language === "pt" ? "Fechar" : "Close"}
                </button>
              </div>

              {user ? (
                <NotificationsPanel userId={user.id} />
              ) : (
                <div className="ui-card p-5 text-sm text-[var(--text-3)]">
                  {language === "pt"
                    ? "Entre na sua conta para ver notificações."
                    : "Sign in to view notifications."}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {menuVisible ? (
        <div
          className={`ui-modal-backdrop fixed inset-0 z-50 transition-opacity duration-180 ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute right-8 top-24 hidden md:block"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="command-menu ui-slide-up w-[520px] overflow-hidden p-0 shadow-[0_26px_90px_rgba(0,0,0,0.45)]">
              <div className="command-menu-header">
                <p className="page-kicker">{language === "pt" ? "Registrar" : "Register"}</p>
                <h2>{language === "pt" ? "Escolha o próximo passo" : "Choose the next step"}</h2>
                <p>
                  {language === "pt"
                    ? "Cada opção abre somente os campos necessários. Menos tela, menos dúvida."
                    : "Each option opens only the fields needed. Less screen, less doubt."}
                </p>
              </div>
              <div className="grid grid-cols-2">
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openNewEntry(item.key);
                    }}
                    className="command-menu-item"
                  >
                    <span className="command-menu-icon" style={{ color: item.color }}>
                      <AppIcon name={item.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-[var(--text-1)]">{item.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-[var(--text-3)]">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            className="absolute left-1/2 -translate-x-1/2 md:hidden"
            style={{ bottom: "calc(100px + env(safe-area-inset-bottom))" }}
            ref={menuRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative h-[200px] w-[200px]">
              {menuItems.map((item, index) => {
                const angles = [225, 180, 135, 45, 0, 315];
                const angle = angles[index] ?? 0;
                const radius = 88;
                const rad = (angle * Math.PI) / 180;
                const x = Math.cos(rad) * radius;
                const y = Math.sin(rad) * radius;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openNewEntry(item.key);
                    }}
                    className={`absolute left-1/2 top-1/2 flex flex-col items-center gap-1.5 transition-all duration-200 ${
                      menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                    style={{
                      transform: menuOpen
                        ? `translate(calc(${x}px - 50%), calc(${y}px - 50%)) scale(1)`
                        : "translate(-50%, -50%) scale(0.3)",
                      transitionDelay: menuOpen ? `${index * 30}ms` : "0ms",
                    }}
                  >
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-bright)] bg-[var(--surface-2)] shadow-[var(--shadow-md)]"
                      style={{ color: item.color }}
                    >
                      <AppIcon name={item.icon} size={18} />
                    </span>
                    <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-1)]">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
