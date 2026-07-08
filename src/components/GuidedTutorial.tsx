"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";

type Placement = "top" | "bottom" | "left" | "right" | "center";

type TutorialStep = {
  id: string;
  target?: string;
  path?: string;
  title: string;
  body: string;
  hint?: string;
  waitForClick?: boolean;
  preventTargetAction?: boolean;
  placement?: Placement;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const ACTIVE_KEY = "guimfinancial:tutorial:active";
const COMPLETED_KEY = "guimfinancial:tutorial:completed";
const STEP_KEY = "guimfinancial:tutorial:step";
const RESTART_EVENT = "guimfinancial:restart-tutorial";

function isVisibleElement(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function findVisibleTarget(selector?: string): HTMLElement | null {
  if (!selector || typeof document === "undefined") return null;
  const elements = Array.from(document.querySelectorAll(selector));
  return elements.find(isVisibleElement) ?? null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSteps(language: "pt" | "en"): TutorialStep[] {
  if (language === "en") {
    return [
      { id: "welcome", title: "Welcome to your financial cockpit", body: "This tour teaches the app from the beginning. Click each highlighted item to move forward.", hint: "Short mission, useful map, zero spreadsheet goblins.", placement: "center" },
      { id: "home", target: '[data-tour="nav-home"]', path: "/", title: "Start from Principal", body: "Principal is the monthly command center. It summarizes the month before you dive into details.", hint: "Click Principal to continue.", waitForClick: true, placement: "bottom" },
      { id: "home-balance", target: '[data-tour="home-balance-card"]', title: "Current balance", body: "This card shows how much money is available in accounts after considering the month. The smaller blocks show active accounts and card usage.", hint: "Click this card to continue.", waitForClick: true, placement: "right" },
      { id: "home-income-expenses", target: '[data-tour="home-income-expenses-card"]', title: "Income vs expenses", body: "This card compares what entered and what left in the selected month. It also estimates result, savings rate, daily average, projection, and expense pressure.", hint: "Click this card to continue.", waitForClick: true, placement: "left" },
      { id: "home-income", target: '[data-tour="home-income-card"]', title: "How income works", body: "Income is registered by date. If you add next month's wage, the app treats it as next month's money. Expenses and card bills assigned to that month reduce the space available from that wage, like a credit card cycle.", hint: "Click the income card to continue.", waitForClick: true, placement: "bottom" },
      { id: "home-expenses", target: '[data-tour="home-expenses-card"]', title: "Expenses", body: "Expenses are money leaving accounts or cards. They reduce the month result and help you understand whether the next wage already has commitments waiting.", hint: "Click the expenses card to continue.", waitForClick: true, placement: "bottom" },
      { id: "home-budget", target: '[data-tour="home-budget-card"]', title: "Budget", body: "Budget reserves money by category. It answers: how much did I plan, how much did I spend, and how much is still safe to use?", hint: "Click the budget card to continue.", waitForClick: true, placement: "right" },
      { id: "home-categories", target: '[data-tour="home-categories-card"]', title: "Categories", body: "Categories show where your money is going. The volume chart makes it easier to spot the areas that are eating the month.", hint: "Click the categories card to continue.", waitForClick: true, placement: "left" },
      { id: "home-flow", target: '[data-tour="home-flow-card"]', title: "Monthly flow", body: "This chart shows income, expenses, daily balance, and accumulated balance over time. It is the month breathing in graph form.", hint: "Click the chart to continue.", waitForClick: true, placement: "top" },
      { id: "home-accounts", target: '[data-tour="home-accounts-card"]', title: "Accounts", body: "Accounts are your cash bases: bank accounts, wallets, and places where money actually sits.", hint: "Click the accounts card to continue.", waitForClick: true, placement: "right" },
      { id: "home-cards", target: '[data-tour="home-cards-card"]', title: "Credit cards", body: "Cards group current bills, limits, due dates, your own cards, and friend cards. Card expenses can affect a later month depending on closing and due dates.", hint: "Click the cards card to continue.", waitForClick: true, placement: "top" },
      { id: "register", target: '[data-tour="register-button"]', title: "The Register button", body: "This is the fastest way to add anything: income, expenses, card expenses, friend assignments, transfers, or investments.", hint: "Click Register to open the action menu.", waitForClick: true, placement: "bottom" },
      { id: "feature-income", target: '[data-tour="register-income"]', title: "Receita", body: "Use Income for salary, refunds, reimbursements, and any money entering an account. Salary can be dated in the next month so this month's commitments are measured against that future wage.", hint: "Click Income just to learn this option.", waitForClick: true, preventTargetAction: true, placement: "left" },
      { id: "feature-expense", target: '[data-tour="register-expense"]', title: "Despesa", body: "Use Expense for money paid directly from an account, like PIX, debit, cash, or anything that leaves your balance immediately.", hint: "Click Expense to continue.", waitForClick: true, preventTargetAction: true, placement: "left" },
      { id: "feature-card", target: '[data-tour="register-card_expense"]', title: "Despesa cartão", body: "Use Card Expense for purchases on your own card or a friend's card. The app uses closing and due dates to place the bill in the right month.", hint: "Click Card Expense to continue.", waitForClick: true, preventTargetAction: true, placement: "left" },
      { id: "feature-friends", target: '[data-tour="register-share_with_friend"]', title: "Atribuir a amigos", body: "Use Assign to friends when another user should receive an income, expense, or card expense request and accept it in Notifications.", hint: "Click Assign to friends to continue.", waitForClick: true, preventTargetAction: true, placement: "left" },
      { id: "feature-transfer", target: '[data-tour="register-transfer"]', title: "Transferência", body: "Use Transfer to move money between your own accounts without creating income or expense noise.", hint: "Click Transfer to continue.", waitForClick: true, preventTargetAction: true, placement: "left" },
      { id: "feature-investment", target: '[data-tour="register-investment"]', title: "Novo investimento", body: "Use New investment to register an asset purchase and keep your portfolio updated.", hint: "Click New investment to continue.", waitForClick: true, preventTargetAction: true, placement: "left" },
      { id: "open-income", target: '[data-tour="register-income"]', title: "Open one form", body: "Now open Income for real so you can see the focused form style. You do not need to save anything.", hint: "Click Income again.", waitForClick: true, placement: "left" },
      { id: "close-entry", target: '[data-tour="new-entry-close"]', title: "Close the form", body: "Every launch form is intentionally focused so users learn one financial action at a time.", hint: "Click Close to return to the tour.", waitForClick: true, placement: "left" },
      { id: "transactions", target: '[data-tour="nav-transactions"]', path: "/transactions", title: "Transactions", body: "Transactions is where you inspect the month, filter records, edit entries, and separate your own cards from friends' cards.", hint: "Click Transactions.", waitForClick: true, placement: "bottom" },
      { id: "budget", target: '[data-tour="nav-budget"]', path: "/budget", title: "Budget screen", body: "Budget is where you define category limits and compare planned spending with actual spending.", hint: "Click Budget.", waitForClick: true, placement: "bottom" },
      { id: "investments", target: '[data-tour="nav-investments"]', path: "/investments", title: "Investments", body: "Investments holds your assets, quotes, portfolio summary, risk analysis, and B3 discovery filters.", hint: "Click Investments.", waitForClick: true, placement: "bottom" },
      { id: "discover-assets", target: '[data-tour="investments-discover"]', path: "/investments", title: "Discover B3 assets", body: "Use this filter to search market assets by DY, P/VP, or ROI. It is not limited to your wallet.", hint: "Click Discover assets.", waitForClick: true, placement: "bottom" },
      { id: "close-discovery", target: '[data-tour="investments-discovery-close"]', title: "Close discovery", body: "This popup is for comparing B3 assets by indicator before deciding what deserves deeper analysis.", hint: "Click Cancel.", waitForClick: true, placement: "left" },
      { id: "portfolio-analysis", target: '[data-tour="portfolio-analysis-open"]', path: "/investments", title: "Portfolio analysis on demand", body: "The complete portfolio analysis opens only when needed, keeping the Investments page lighter.", hint: "Click Open analysis.", waitForClick: true, placement: "left" },
      { id: "close-portfolio", target: '[data-tour="portfolio-analysis-close"]', title: "Close portfolio analysis", body: "Risk, allocation, and weights stay one click away without polluting the main flow.", hint: "Click Close.", waitForClick: true, placement: "left" },
      { id: "more", target: '[data-tour="nav-more"]', path: "/more", title: "Mais", body: "Mais groups settings, friends, security, language, export, accounts, cards, and the tutorial reset.", hint: "Click Mais.", waitForClick: true, placement: "bottom" },
      { id: "notifications", target: '[data-tour="notifications-button"]', title: "Notifications", body: "Friend assignments arrive here. You can accept or decline shared income and expenses.", hint: "Click Notifications.", waitForClick: true, placement: "bottom" },
      { id: "close-notifications", target: '[data-tour="notifications-close"]', title: "Close notifications", body: "That inbox is where shared requests wait for your decision.", hint: "Click Close to finish the tour.", waitForClick: true, placement: "left" },
      { id: "finish", title: "You are ready", body: "That is the map. Add accounts first, register income and expenses, review Transactions, and use Budget and Investments to refine the month.", hint: "Tiny ritual complete. Your financial dashboard has been officially tamed.", placement: "center" },
    ];
  }

  return [
    { id: "welcome", title: "Bem-vindo ao seu painel financeiro", body: "Este guia ensina o app desde o começo. Clique em cada item destacado para avançar.", hint: "Missão curta, mapa útil e nenhum duende maligno da planilha.", placement: "center" },
    { id: "home", target: '[data-tour="nav-home"]', path: "/", title: "Comece pela Principal", body: "A Principal é o centro do seu mês. Ela resume o mês antes de você entrar nos detalhes.", hint: "Clique em Principal para continuar.", waitForClick: true, placement: "bottom" },
    { id: "home-balance", target: '[data-tour="home-balance-card"]', title: "Saldo atual", body: "Este card mostra quanto dinheiro está disponível nas contas depois de considerar o mês. Os blocos menores mostram contas ativas e uso em cartões.", hint: "Clique neste card para continuar.", waitForClick: true, placement: "right" },
    { id: "home-income-expenses", target: '[data-tour="home-income-expenses-card"]', title: "Entradas vs Saídas", body: "Este card compara o que entrou e o que saiu no mês selecionado. Ele também estima resultado, poupança, média por dia, projeção e pressão de despesas.", hint: "Clique neste card para continuar.", waitForClick: true, placement: "left" },
    { id: "home-income", target: '[data-tour="home-income-card"]', title: "Como funcionam as receitas", body: "Receitas entram pela data cadastrada. Se você lançar o salário do próximo mês, ele fica naquele mês. As despesas e faturas atribuídas para esse período diminuem o espaço disponível desse salário, como acontece em um ciclo de cartão.", hint: "Clique no card de Receitas para continuar.", waitForClick: true, placement: "bottom" },
    { id: "home-expenses", target: '[data-tour="home-expenses-card"]', title: "Despesas", body: "Despesas são saídas de contas ou cartões. Elas reduzem o resultado do mês e mostram se o próximo salário já tem compromissos esperando.", hint: "Clique no card de Despesas para continuar.", waitForClick: true, placement: "bottom" },
    { id: "home-budget", target: '[data-tour="home-budget-card"]', title: "Orçamento", body: "Orçamento reserva dinheiro por categoria. Ele responde: quanto planejei, quanto já gastei e quanto ainda posso usar com segurança?", hint: "Clique no card de Orçamento para continuar.", waitForClick: true, placement: "right" },
    { id: "home-categories", target: '[data-tour="home-categories-card"]', title: "Categorias", body: "Categorias mostram para onde seu dinheiro está indo. O gráfico de volume ajuda a identificar as áreas que mais pesam no mês.", hint: "Clique no card de Categorias para continuar.", waitForClick: true, placement: "left" },
    { id: "home-flow", target: '[data-tour="home-flow-card"]', title: "Fluxo mensal", body: "Este gráfico mostra receitas, despesas, saldo diário e saldo acumulado ao longo do tempo. É o mês respirando em forma de gráfico.", hint: "Clique no gráfico para continuar.", waitForClick: true, placement: "top" },
    { id: "home-accounts", target: '[data-tour="home-accounts-card"]', title: "Contas", body: "Contas são suas bases de caixa: bancos, carteiras e lugares onde o dinheiro realmente fica.", hint: "Clique no card de Contas para continuar.", waitForClick: true, placement: "right" },
    { id: "home-cards", target: '[data-tour="home-cards-card"]', title: "Cartões de crédito", body: "Cartões agrupam faturas, limites, vencimentos, seus cartões e cartões de amigos. Despesas no cartão podem cair em outro mês conforme fechamento e vencimento.", hint: "Clique no card de Cartões para continuar.", waitForClick: true, placement: "top" },
    { id: "register", target: '[data-tour="register-button"]', title: "Botão Registrar", body: "Este é o caminho mais rápido para lançar qualquer coisa: receita, despesa, despesa no cartão, atribuição para amigos, transferência ou investimento.", hint: "Clique em Registrar para abrir o menu.", waitForClick: true, placement: "bottom" },
    { id: "feature-income", target: '[data-tour="register-income"]', title: "Receita", body: "Use Receita para salário, reembolso, devolução e qualquer dinheiro entrando em uma conta. O salário pode ser lançado no mês seguinte para medir o que já compromete aquele pagamento.", hint: "Clique em Receita apenas para aprender esta opção.", waitForClick: true, preventTargetAction: true, placement: "left" },
    { id: "feature-expense", target: '[data-tour="register-expense"]', title: "Despesa", body: "Use Despesa para dinheiro pago direto de uma conta: PIX, débito, dinheiro ou qualquer saída que reduz o saldo imediatamente.", hint: "Clique em Despesa para continuar.", waitForClick: true, preventTargetAction: true, placement: "left" },
    { id: "feature-card", target: '[data-tour="register-card_expense"]', title: "Despesa cartão", body: "Use Despesa cartão para compras no seu cartão ou no cartão de um amigo. O app usa fechamento e vencimento para colocar a fatura no mês certo.", hint: "Clique em Despesa cartão para continuar.", waitForClick: true, preventTargetAction: true, placement: "left" },
    { id: "feature-friends", target: '[data-tour="register-share_with_friend"]', title: "Atribuir a amigos", body: "Use Atribuir a amigos quando outro usuário deve receber uma receita, despesa ou despesa de cartão e aceitar pela caixa de Notificações.", hint: "Clique em Atribuir a amigos para continuar.", waitForClick: true, preventTargetAction: true, placement: "left" },
    { id: "feature-transfer", target: '[data-tour="register-transfer"]', title: "Transferência", body: "Use Transferência para mover dinheiro entre suas próprias contas sem criar uma receita ou despesa falsa.", hint: "Clique em Transferência para continuar.", waitForClick: true, preventTargetAction: true, placement: "left" },
    { id: "feature-investment", target: '[data-tour="register-investment"]', title: "Novo investimento", body: "Use Novo investimento para registrar a compra de um ativo e manter sua carteira atualizada.", hint: "Clique em Novo investimento para continuar.", waitForClick: true, preventTargetAction: true, placement: "left" },
    { id: "open-income", target: '[data-tour="register-income"]', title: "Abra um formulário", body: "Agora abra Receita de verdade para ver o estilo dos formulários focados. Você não precisa salvar nada.", hint: "Clique em Receita novamente.", waitForClick: true, placement: "left" },
    { id: "close-entry", target: '[data-tour="new-entry-close"]', title: "Feche o formulário", body: "Cada formulário de lançamento é focado em uma tarefa para o usuário aprender uma ação financeira por vez.", hint: "Clique em Fechar para voltar ao tutorial.", waitForClick: true, placement: "left" },
    { id: "transactions", target: '[data-tour="nav-transactions"]', path: "/transactions", title: "Transações", body: "Em Transações você acompanha o mês, filtra registros, edita lançamentos e separa seus cartões dos cartões de amigos.", hint: "Clique em Transações.", waitForClick: true, placement: "bottom" },
    { id: "budget", target: '[data-tour="nav-budget"]', path: "/budget", title: "Tela de Orçamento", body: "Orçamento é onde você define limites por categoria e compara o planejado com o gasto real.", hint: "Clique em Orçamento.", waitForClick: true, placement: "bottom" },
    { id: "investments", target: '[data-tour="nav-investments"]', path: "/investments", title: "Investimentos", body: "Investimentos reúne ativos, cotações, resumo da carteira, análise de risco e filtros de descoberta da B3.", hint: "Clique em Investimentos.", waitForClick: true, placement: "bottom" },
    { id: "discover-assets", target: '[data-tour="investments-discover"]', path: "/investments", title: "Descubra ativos da B3", body: "Use este filtro para buscar ativos por DY, P/VP ou ROI. A busca não fica limitada à sua carteira.", hint: "Clique em Descobrir ativos.", waitForClick: true, placement: "bottom" },
    { id: "close-discovery", target: '[data-tour="investments-discovery-close"]', title: "Feche a descoberta", body: "Este popup serve para comparar ativos da B3 por indicador antes de decidir o que merece uma análise mais profunda.", hint: "Clique em Cancelar.", waitForClick: true, placement: "left" },
    { id: "portfolio-analysis", target: '[data-tour="portfolio-analysis-open"]', path: "/investments", title: "Análise da carteira sob demanda", body: "A análise completa da carteira abre apenas quando necessário, mantendo a página de Investimentos mais leve.", hint: "Clique em Abrir análise.", waitForClick: true, placement: "left" },
    { id: "close-portfolio", target: '[data-tour="portfolio-analysis-close"]', title: "Feche a análise da carteira", body: "Risco, alocação e maiores pesos ficam a um clique de distância sem poluir o fluxo principal.", hint: "Clique em Fechar.", waitForClick: true, placement: "left" },
    { id: "more", target: '[data-tour="nav-more"]', path: "/more", title: "Mais", body: "Mais reúne configurações, amigos, segurança, idioma, exportação, contas, cartões e o botão para reiniciar este tutorial.", hint: "Clique em Mais.", waitForClick: true, placement: "bottom" },
    { id: "notifications", target: '[data-tour="notifications-button"]', title: "Notificações", body: "As atribuições de amigos chegam aqui. Você pode aceitar ou recusar receitas e despesas compartilhadas.", hint: "Clique em Notificações.", waitForClick: true, placement: "bottom" },
    { id: "close-notifications", target: '[data-tour="notifications-close"]', title: "Feche as notificações", body: "Essa caixa de entrada é onde pedidos compartilhados esperam sua decisão.", hint: "Clique em Fechar para concluir o tour.", waitForClick: true, placement: "left" },
    { id: "finish", title: "Você está pronto", body: "Esse é o mapa. Adicione contas primeiro, registre receitas e despesas, revise Transações e use Orçamento e Investimentos para refinar o mês.", hint: "Ritual concluído. Seu painel financeiro foi oficialmente domado.", placement: "center" },
  ];
}

export function GuidedTutorial() {
  const { language } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => getSteps(language), [language]);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  const currentStep = steps[clamp(stepIndex, 0, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;

  const persistStep = useCallback((nextIndex: number) => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, String(nextIndex));
  }, []);

  const finishTutorial = useCallback(() => {
    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(STEP_KEY);
    setActive(false);
    setStepIndex(0);
  }, []);

  const goNext = useCallback(() => {
    setStepIndex((current) => {
      const next = current + 1;
      if (next >= steps.length) {
        window.setTimeout(finishTutorial, 0);
        return current;
      }
      persistStep(next);
      return next;
    });
  }, [finishTutorial, persistStep, steps.length]);

  const skipTutorial = useCallback(() => {
    finishTutorial();
  }, [finishTutorial]);

  const goToStepPath = useCallback(() => {
    if (currentStep.path) router.push(currentStep.path);
  }, [currentStep.path, router]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      const completed = localStorage.getItem(COMPLETED_KEY) === "true";
      const shouldResume = localStorage.getItem(ACTIVE_KEY) === "true";
      if (!completed || shouldResume) {
        const storedStep = Number(localStorage.getItem(STEP_KEY) ?? "0");
        setStepIndex(Number.isFinite(storedStep) ? clamp(storedStep, 0, steps.length - 1) : 0);
        setActive(true);
      }
    }, 0);

    function restartTutorial() {
      localStorage.removeItem(COMPLETED_KEY);
      localStorage.setItem(ACTIVE_KEY, "true");
      localStorage.setItem(STEP_KEY, "0");
      setStepIndex(0);
      setActive(true);
    }

    window.addEventListener(RESTART_EVENT, restartTutorial);
    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener(RESTART_EVENT, restartTutorial);
    };
  }, [steps.length]);

  useEffect(() => {
    if (!active) return;

    let frame = 0;

    function refreshTarget() {
      const element = findVisibleTarget(currentStep.target);
      setTargetElement(element);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      } else {
        setTargetRect(null);
      }
    }

    frame = window.requestAnimationFrame(refreshTarget);
    const interval = window.setInterval(refreshTarget, 180);
    window.addEventListener("resize", refreshTarget);
    window.addEventListener("scroll", refreshTarget, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("resize", refreshTarget);
      window.removeEventListener("scroll", refreshTarget, true);
    };
  }, [active, currentStep.target, pathname]);

  useEffect(() => {
    if (!active || !targetElement) return;
    targetElement.classList.add("tour-target-active");
    return () => targetElement.classList.remove("tour-target-active");
  }, [active, targetElement]);

  useEffect(() => {
    if (!active || !targetElement || !currentStep.target) return;
    const rect = targetElement.getBoundingClientRect();
    const comfortableMargin = 120;
    const isOutsideComfortZone =
      rect.top < comfortableMargin ||
      rect.bottom > window.innerHeight - comfortableMargin ||
      rect.left < 16 ||
      rect.right > window.innerWidth - 16;

    if (!isOutsideComfortZone && currentStep.id !== "portfolio-analysis") return;

    targetElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  }, [active, currentStep.id, currentStep.target, targetElement]);

  useEffect(() => {
    if (!active || !targetElement || !currentStep.waitForClick) return;

    function handleTargetClick(event: MouseEvent) {
      if (currentStep.preventTargetAction) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
      goNext();
    }

    targetElement.addEventListener("click", handleTargetClick, true);
    return () => targetElement.removeEventListener("click", handleTargetClick, true);
  }, [active, currentStep.preventTargetAction, currentStep.waitForClick, goNext, targetElement]);

  const cardStyle = useMemo(() => {
    if (typeof window === "undefined" || currentStep.placement === "center" || !targetRect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const gap = 18;
    const width = Math.min(390, window.innerWidth - 28);
    const height = 330;
    const placement = currentStep.placement ?? "bottom";
    let top = targetRect.top + targetRect.height + gap;
    let left = targetRect.left + targetRect.width / 2 - width / 2;

    if (placement === "top") {
      top = targetRect.top - height - gap;
    } else if (placement === "left") {
      top = targetRect.top + targetRect.height / 2 - height / 2;
      left = targetRect.left - width - gap;
    } else if (placement === "right") {
      top = targetRect.top + targetRect.height / 2 - height / 2;
      left = targetRect.left + targetRect.width + gap;
    }

    if (placement === "left" && left < 14) {
      left = targetRect.left + targetRect.width + gap;
    }
    if (placement === "right" && left + width > window.innerWidth - 14) {
      left = targetRect.left - width - gap;
    }
    if (placement === "top" && top < 14) {
      top = targetRect.top + targetRect.height + gap;
    }
    if (placement === "bottom" && top + height > window.innerHeight - 14) {
      top = targetRect.top - height - gap;
    }

    return {
      left: `${clamp(left, 14, window.innerWidth - width - 14)}px`,
      top: `${clamp(top, 14, Math.max(14, window.innerHeight - height - 14))}px`,
      width: `${width}px`,
      transform: "none",
    };
  }, [currentStep.placement, targetRect]);

  if (!active || !currentStep) return null;

  const canClickHighlighted = Boolean(currentStep.waitForClick && targetElement);
  const isAwayFromStepPath = Boolean(currentStep.path && pathname !== currentStep.path);
  const shouldShowPrimaryAction = !canClickHighlighted;
  const primaryLabel = stepIndex === 0
    ? language === "pt" ? "Começar" : "Start"
    : isLastStep
      ? language === "pt" ? "Finalizar" : "Finish"
      : isAwayFromStepPath
        ? language === "pt" ? "Ir para a tela" : "Go to screen"
        : language === "pt" ? "Pular etapa" : "Skip step";

  return (
    <>
      <div className="guided-tour-dim" aria-hidden="true" />
      {targetRect ? (
        <div
          className="guided-tour-highlight"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
          aria-hidden="true"
        />
      ) : null}

      <section className="guided-tour-card" style={cardStyle} role="dialog" aria-live="polite" aria-label={currentStep.title}>
        <div className="flex items-center justify-between gap-3">
          <p className="guided-tour-kicker">
            {language === "pt" ? "Guia inicial" : "Starter guide"} {stepIndex + 1}/{steps.length}
          </p>
          <button type="button" onClick={skipTutorial} className="guided-tour-skip">
            {language === "pt" ? "Pular" : "Skip"}
          </button>
        </div>

        <div className="guided-tour-progress" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>

        <h2>{currentStep.title}</h2>
        <p>{currentStep.body}</p>
        {currentStep.hint ? (
          <div className="guided-tour-hint">
            <span aria-hidden="true">•</span>
            <span>{currentStep.hint}</span>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[var(--text-3)]">
            {canClickHighlighted
              ? language === "pt" ? "Aguardando seu clique no destaque" : "Waiting for your click on the highlight"
              : language === "pt" ? "Você está no controle" : "You are in control"}
          </span>

          {shouldShowPrimaryAction ? (
            <button
              type="button"
              onClick={isLastStep ? finishTutorial : isAwayFromStepPath ? goToStepPath : goNext}
              className="guided-tour-primary"
            >
              {primaryLabel}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
