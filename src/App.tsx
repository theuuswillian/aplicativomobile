import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Home, ReceiptText, TrendingUp, UserRound, Target, Bell, Eye, EyeOff, CircleMinus, CirclePlus, ChartNoAxesColumn } from "lucide-react";
import { supabase } from "./lib/supabase";
import { todayInBrazil } from "./lib/date";
import { toCents } from "./lib/money";
import { BANK_CATALOG, bankLogoStyle } from "./data/bank-catalog";
import { clearFinancialRecordsForUser } from "./lib/secure-storage";
import { generateOccurrences, type RecurrenceFrequency } from "./domain/recurrence";
import { calculateInvestmentSummary, normalizeManualReferencePrice, type InvestmentOperation } from "./domain/investments";
import { parseCsvStatement, parseOfxStatement, planImportBatch, type ImportRow } from "./domain/imports";
import { calculateAccountBalance, calculateCardCommittedLimitCents, calculateInvoice, type InvoicePayment, type LedgerEntry } from "./domain/finance";
import { ReceivablesPanel } from "./features/receivables/ReceivablesPanel";
import { IncomeGoalsPanel } from "./features/income-goals/IncomeGoalsPanel";
type PushSubscriptionRow = { id: string; endpoint: string; user_agent: string | null };
type WhatsappLinkState = { phone: string; weekly_summary_enabled: boolean };
type RadarFireRow = { alert_key: string; fired_at: string; observed_price: string; source: string | null; quote_observed_at: string | null };

type Theme = "dark" | "light";
type DashboardTab = "inicio" | "gastos" | "patrimonio" | "planejamento" | "relatorios" | "conta";
type RadarAlert = {
  id: string;
  asset_class: "stock" | "fii" | "etf" | "bdr" | "crypto";
  symbol: string;
  condition_type: "above" | "below" | "daily_drop";
  threshold: number;
  generation: number;
  is_enabled: boolean;
};
type Profile = { display_name: string | null; email?: string };
type AccountRow = { id: string; name: string; account_type: string; opening_balance: string; opening_balance_date: string; is_primary: boolean; institution_name?: string | null; institution_code?: string | null; institution_logo_key?: string | null };
type CardRow = { id: string; name: string; institution_name: string; last_four: string; brand: string | null; credit_limit: string; closing_day: number; due_day: number; is_archived: boolean };
type CategoryRow = { id: string; name: string; kind: "income" | "expense"; color: string | null; icon: string | null };
type RecurrenceRow = { id: string; name: string; kind: "income" | "expense"; amount: string; frequency: RecurrenceFrequency; interval_count: number; weekday: number | null; month_day: number | null; month_of_year: number | null; starts_on: string; ends_on: string | null; next_occurrence_on: string; account_id: string | null; card_id: string | null; is_active: boolean };
type BudgetRow = { id: string; category_id: string; year: number; month: number; limit_amount: string };
type GoalRow = { id: string; name: string; target_amount: string; current_amount: string; monthly_contribution: string; target_month: string | null };
type GoalContributionRow = { id: string; goal_id: string; amount: string; contribution_date: string; source: string; created_at: string };
type InvestmentAssetRow = { id: string; symbol: string; name: string; asset_class: "stock" | "fii" | "etf" | "bdr" | "fixed_income" | "crypto"; currency: "BRL" | "USD"; current_price?: string | number | null; price_as_of?: string | null; price_source?: "manual" | "brapi.dev" | null; metadata?: Record<string, unknown> };
type InvestmentOperationRow = { id: string; asset_id: string; operation_type: "opening" | "buy" | "sell"; operation_date: string; quantity: string; unit_price: string; gross_amount: string; fees: string };
type IncomeEventRow = { id: string; asset_id: string; event_type: "dividend" | "jcp" | "distribution" | "coupon" | "interest" | "amortization" | "other"; reference_date: string; payment_date: string | null; announced_amount: string; received_amount: string; status: "announced" | "planned" | "received" | "cancelled"; account_id?: string | null; transaction_id?: string | null; settlement_state?: "unsettled" | "settled" };
type BudgetSpendRow = { category_id: string | null; settled_amount: string };
type AccountBalanceRpcRow = { account_id: string; balance: string | number };
type TransactionRow = { id: string; kind: "income" | "expense" | "transfer"; status: "paid" | "planned" | "cancelled"; payment_method?: "pix" | "debit" | "cash" | "credit" | null; amount: string; transaction_date: string; description: string; account_id: string | null; card_id: string | null; transfer_from_account_id: string | null; transfer_to_account_id: string | null; category_id: string | null };
type CardInvoicePaymentRow = { id: string; card_id: string; account_id: string; invoice_closing_date: string; amount: string; payment_date: string; description: string };
type CardInvoiceInstallmentRow = { id: string; transaction_id: string; card_id: string; invoice_closing_date: string; invoice_due_date: string; installment_number: number; installment_count: number; amount: string };
type ImportPreviewRow = ImportRow & { dedupeKey: string; duplicate: boolean };
type ReceiptFileRow = { id: string; transaction_id: string; storage_path: string; mime_type: string; byte_size: number; created_at: string };
type ReceiptDraft = { sufficient: boolean; kind: "income" | "expense" | null; amount: string | null; date: string | null; description: string | null; category: string | null; payment_method: string | null; installment_count: number | null; card_last_four: string | null; confidence: number; warnings: string[] };
const INVESTMENT_CATALOG: Record<string, { name: string; assetClass: InvestmentAssetRow["asset_class"] }> = {
  PETR3:{name:"Petrobras",assetClass:"stock"},PETR4:{name:"Petrobras",assetClass:"stock"},VALE3:{name:"Vale",assetClass:"stock"},
  ITUB4:{name:"Itaú Unibanco",assetClass:"stock"},BBDC4:{name:"Bradesco",assetClass:"stock"},BBAS3:{name:"Banco do Brasil",assetClass:"stock"},
  WEGE3:{name:"WEG",assetClass:"stock"},ABEV3:{name:"Ambev",assetClass:"stock"},B3SA3:{name:"B3",assetClass:"stock"},
  RENT3:{name:"Localiza",assetClass:"stock"},MGLU3:{name:"Magazine Luiza",assetClass:"stock"},LREN3:{name:"Lojas Renner",assetClass:"stock"},
  HGLG11:{name:"Pátria Logística",assetClass:"fii"},MXRF11:{name:"Maxi Renda",assetClass:"fii"},KNRI11:{name:"Kinea Renda Imobiliária",assetClass:"fii"},
  XPLG11:{name:"XP Log",assetClass:"fii"},VISC11:{name:"Vinci Shopping Centers",assetClass:"fii"},CPTS11:{name:"Capitânia Securities II",assetClass:"fii"},
  IVVB11:{name:"iShares S&P 500",assetClass:"etf"},BOVA11:{name:"iShares Ibovespa",assetClass:"etf"},SMAL11:{name:"iShares Small Cap",assetClass:"etf"},
  HASH11:{name:"Hashdex Nasdaq Crypto",assetClass:"etf"},
  XPML11:{name:"XP Malls",assetClass:"fii"},BTLG11:{name:"BTG Pactual Logística",assetClass:"fii"},
  HGRU11:{name:"CSHG Renda Urbana",assetClass:"fii"},IRDM11:{name:"Iridium Recebíveis Imobiliários",assetClass:"fii"},
  BCFF11:{name:"BTG Pactual Fundo de Fundos",assetClass:"fii"},RBRR11:{name:"RBR Rendimento High Grade",assetClass:"fii"},
  HGBS11:{name:"Hedge Brasil Shopping",assetClass:"fii"},PRIO3:{name:"PRIO",assetClass:"stock"},
  DIVO11:{name:"Itaú Dividendos",assetClass:"etf"},AAPL34:{name:"Apple (BDR)",assetClass:"bdr"},
  MSFT34:{name:"Microsoft (BDR)",assetClass:"bdr"},AMZO34:{name:"Amazon (BDR)",assetClass:"bdr"},
  GOGL34:{name:"Alphabet (BDR)",assetClass:"bdr"},NVDC34:{name:"NVIDIA (BDR)",assetClass:"bdr"},
  TSLA34:{name:"Tesla (BDR)",assetClass:"bdr"},MELI34:{name:"MercadoLibre (BDR)",assetClass:"bdr"},
  BBSE3:{name:"BB Seguridade",assetClass:"stock"},BPAC11:{name:"BTG Pactual",assetClass:"stock"},SANB11:{name:"Santander Brasil",assetClass:"stock"},
  CMIG4:{name:"Cemig",assetClass:"stock"},CPLE6:{name:"Copel",assetClass:"stock"},EGIE3:{name:"Engie Brasil",assetClass:"stock"},
  EQTL3:{name:"Equatorial Energia",assetClass:"stock"},SUZB3:{name:"Suzano",assetClass:"stock"},KLBN11:{name:"Klabin",assetClass:"stock"},
  VIVT3:{name:"Telefônica Brasil",assetClass:"stock"},TIMS3:{name:"TIM",assetClass:"stock"},TOTS3:{name:"Totvs",assetClass:"stock"},
  RADL3:{name:"Raia Drogasil",assetClass:"stock"},FLRY3:{name:"Fleury",assetClass:"stock"},GGBR4:{name:"Gerdau",assetClass:"stock"},
  CSNA3:{name:"CSN",assetClass:"stock"},CYRE3:{name:"Cyrela",assetClass:"stock"},MULT3:{name:"Multiplan",assetClass:"stock"},
  CCRO3:{name:"CCR",assetClass:"stock"},SBSP3:{name:"Sabesp",assetClass:"stock"},
  KNCR11:{name:"Kinea Rendimentos Imobiliários",assetClass:"fii"},KNIP11:{name:"Kinea Índices de Preços",assetClass:"fii"},
  KNSC11:{name:"Kinea Securities",assetClass:"fii"},VGIR11:{name:"Valora RE III",assetClass:"fii"},VGHF11:{name:"Valora Hedge Fund",assetClass:"fii"},
  GARE11:{name:"Guardian Real Estate",assetClass:"fii"},TRXF11:{name:"TRX Real Estate",assetClass:"fii"},PVBI11:{name:"VBI Prime Properties",assetClass:"fii"},
  RBRF11:{name:"RBR Alpha Fundo de Fundos",assetClass:"fii"},HGRE11:{name:"Pátria Escritórios",assetClass:"fii"},
  HSML11:{name:"Hedge Shopping Parque Dom Pedro",assetClass:"fii"},MALL11:{name:"Malls Brasil Plural",assetClass:"fii"},
  ALZR11:{name:"Alianza Trust Renda Imobiliária",assetClass:"fii"},LVBI11:{name:"VBI Logístico",assetClass:"fii"},
  GGRC11:{name:"GGR Covepi Renda",assetClass:"fii"},RZTR11:{name:"Riza Terrax",assetClass:"fii"},
  JSRE11:{name:"JS Real Estate Multigestão",assetClass:"fii"},RECT11:{name:"REC Renda Imobiliária",assetClass:"fii"}
};

const THEME_STORAGE_KEY = "granaviva:theme:v1";

function getInitialTheme(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a operação.";
}

function decimalToCents(value: string | number): bigint {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

function formatCents(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const formattedWhole = new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(whole);
  return `${negative ? "-" : ""}${formattedWhole},${fraction}`;
}

function formatInvestmentCents(value: bigint, currency: "BRL" | "USD"): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = Number(absolute % 100n) / 100;
  const numeric = Number(whole) + fraction;
  return `${negative ? "-" : ""}${new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)}`;
}

function normalizeBrlAmount(value: string, allowZero = false, allowNegative = false): string | null {
  const input = value.trim();
  if (!/^-?\d{1,10}(?:,\d{1,2})?$/.test(input)) return null;
  const negative = input.startsWith("-");
  if (negative && !allowNegative) return null;
  const unsigned = negative ? input.slice(1) : input;
  const [whole, fraction = ""] = unsigned.split(",");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (!allowZero && cents === 0n) return null;
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(2, "0")}`;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<DashboardTab>("inicio");
  const [navigationHidden, setNavigationHidden] = useState(false);
  const scrollDirectionRef = useRef({ lastY: 0, down: 0, up: 0 });
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [balancesHidden, setBalancesHidden] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authMode, setAuthMode] = useState<"entrar" | "criar">("entrar");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [radarFires, setRadarFires] = useState<RadarFireRow[]>([]);
  const [symbol, setSymbol] = useState("");
  const [assetClass, setAssetClass] = useState<RadarAlert["asset_class"]>("stock");
  const [condition, setCondition] = useState<RadarAlert["condition_type"]>("above");
  const [threshold, setThreshold] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<CardInvoicePaymentRow[]>([]);
  const [cardInstallments, setCardInstallments] = useState<CardInvoiceInstallmentRow[]>([]);
  const [financialSummary, setFinancialSummary] = useState<{ receivables_brl?: number; overtime_forecast_brl?: number; investment_reference_brl?: number; investment_reference_usd?: number } | null>(null);
  const [ledgerAccountBalances, setLedgerAccountBalances] = useState<Record<string, number> | null>(null);
  const [ledgerRefreshVersion, setLedgerRefreshVersion] = useState(0);
  const requestLedgerRefresh = useCallback(() => setLedgerRefreshVersion((version) => version + 1), []);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recurrences, setRecurrences] = useState<RecurrenceRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalContributions, setGoalContributions] = useState<GoalContributionRow[]>([]);
  const [investmentAssets, setInvestmentAssets] = useState<InvestmentAssetRow[]>([]);
  const [investmentOperations, setInvestmentOperations] = useState<InvestmentOperationRow[]>([]);
  const [incomeEvents, setIncomeEvents] = useState<IncomeEventRow[]>([]);
  const [incomeSettlementReady, setIncomeSettlementReady] = useState(false);
  const [pushSubscriptions, setPushSubscriptions] = useState<PushSubscriptionRow[]>([]);
  const [whatsappLink, setWhatsappLink] = useState<WhatsappLinkState | null>(null);
  const [whatsappLinkCode, setWhatsappLinkCode] = useState("");
  const [whatsappSummaryEnabled, setWhatsappSummaryEnabled] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [incomeAssetId, setIncomeAssetId] = useState("");
  const [incomeEventType, setIncomeEventType] = useState<IncomeEventRow["event_type"]>("dividend");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeReferenceDate, setIncomeReferenceDate] = useState(todayInBrazil);
  const [incomePaymentDate, setIncomePaymentDate] = useState("");
  const [incomeStatus, setIncomeStatus] = useState<IncomeEventRow["status"]>("announced");
  const [incomeDestinationAccountId, setIncomeDestinationAccountId] = useState("");
  const [investmentSymbol, setInvestmentSymbol] = useState("");
  const [investmentName, setInvestmentName] = useState("");
  const [investmentClass, setInvestmentClass] = useState<InvestmentAssetRow["asset_class"]>("stock");
  const [investmentCurrency, setInvestmentCurrency] = useState<"BRL" | "USD">("BRL");
  const [manualPriceInputs, setManualPriceInputs] = useState<Record<string, string>>({});
  const [investmentAssetId, setInvestmentAssetId] = useState("");
  const [investmentOperationType, setInvestmentOperationType] = useState<"opening" | "buy" | "sell">("buy");
  const [investmentQuantity, setInvestmentQuantity] = useState("");
  const [investmentUnitPrice, setInvestmentUnitPrice] = useState("");
  const [investmentFees, setInvestmentFees] = useState("0,00");
  const [investmentDate, setInvestmentDate] = useState(todayInBrazil);
  const [fixedIncomeProduct, setFixedIncomeProduct] = useState("CDB");
  const [fixedIncomeIssuer, setFixedIncomeIssuer] = useState("");
  const [fixedIncomeIndexer, setFixedIncomeIndexer] = useState<"CDI" | "IPCA" | "SELIC" | "PREFIXADO">("CDI");
  const [fixedIncomeRate, setFixedIncomeRate] = useState("");
  const [fixedIncomeMaturity, setFixedIncomeMaturity] = useState("");
  const [fixedIncomeNextYieldDate, setFixedIncomeNextYieldDate] = useState("");
  const [fixedIncomeStart, setFixedIncomeStart] = useState(todayInBrazil);
  const [fixedIncomeFrequency, setFixedIncomeFrequency] = useState<"daily" | "monthly" | "semiannual" | "at_maturity">("daily");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalMonthly, setGoalMonthly] = useState("0,00");
  const [goalTargetMonth, setGoalTargetMonth] = useState("");
  const [goalContributionAmounts, setGoalContributionAmounts] = useState<Record<string, string>>({});
  const [importFormat, setImportFormat] = useState<"CSV" | "OFX">("CSV");
  const [importDestinationType, setImportDestinationType] = useState<"account" | "card">("account");
  const [importDestinationId, setImportDestinationId] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [budgetSpend, setBudgetSpend] = useState<BudgetSpendRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [cardName, setCardName] = useState("");
  const [cardInstitution, setCardInstitution] = useState("");
  const [cardLastFour, setCardLastFour] = useState("");
  const [cardLimit, setCardLimit] = useState("0,00");
  const [cardClosingDay, setCardClosingDay] = useState("10");
  const [cardDueDay, setCardDueDay] = useState("17");
  const [categoryName, setCategoryName] = useState("");
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [categoryKind, setCategoryKind] = useState<"income" | "expense">("expense");
  const [txCategoryId, setTxCategoryId] = useState("");
  const [txCardId, setTxCardId] = useState("");
  const [txInstallmentCount, setTxInstallmentCount] = useState("1");
  const [recurrenceName, setRecurrenceName] = useState("");
  const [recurrenceKind, setRecurrenceKind] = useState<"income" | "expense">("expense");
  const [recurrenceAmount, setRecurrenceAmount] = useState("");
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceRow["frequency"]>("monthly");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
  const [recurrenceWeekday, setRecurrenceWeekday] = useState("1");
  const [recurrenceMonthDay, setRecurrenceMonthDay] = useState("1");
  const [recurrenceMonth, setRecurrenceMonth] = useState("1");
  const [recurrenceStart, setRecurrenceStart] = useState(todayInBrazil);
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [recurrenceCategoryId, setRecurrenceCategoryId] = useState("");
  const [recurrenceAccountId, setRecurrenceAccountId] = useState("");
  const [recurrenceCardId, setRecurrenceCardId] = useState("");
  const currentBudgetDate = todayInBrazil();
  const [currentBudgetYear, currentBudgetMonth] = currentBudgetDate.split("-").map(Number);
  const currentBudgetMonthStart = `${currentBudgetYear}-${String(currentBudgetMonth).padStart(2, "0")}-01`;
  const nextBudgetMonthStart = new Date(Date.UTC(currentBudgetYear, currentBudgetMonth, 1)).toISOString().slice(0, 10);
  const [accountName, setAccountName] = useState("");
  const [accountInstitutionKey, setAccountInstitutionKey] = useState("");
  const [accountType, setAccountType] = useState("checking");
  const [openingBalance, setOpeningBalance] = useState("0,00");
  const [txDescription, setTxDescription] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txKind, setTxKind] = useState<"income" | "expense" | "transfer">("expense");
  const [txPaymentMethod, setTxPaymentMethod] = useState<"pix" | "debit" | "cash" | "credit">("pix");
  const [txTransferFromId, setTxTransferFromId] = useState("");
  const [txTransferToId, setTxTransferToId] = useState("");
  const [txStatus, setTxStatus] = useState<"paid" | "planned">("paid");
  const [txDate, setTxDate] = useState(todayInBrazil);
  const [txAccountId, setTxAccountId] = useState("");
  const [invoicePaymentCardId, setInvoicePaymentCardId] = useState("");
  const [invoicePaymentAccountId, setInvoicePaymentAccountId] = useState("");
  const [invoiceClosingDate, setInvoiceClosingDate] = useState(todayInBrazil);
  const [invoicePaymentAmount, setInvoicePaymentAmount] = useState("");
  const [invoicePaymentDate, setInvoicePaymentDate] = useState(todayInBrazil);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<"paid" | "planned">("paid");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantConsent, setAssistantConsent] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<ReceiptFileRow[]>([]);
  const [receiptConsent, setReceiptConsent] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [receiptAccountId, setReceiptAccountId] = useState("");

  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* sessão continua funcional */ }
  }, [theme]);

  // Navegação inferior inteligente: recolhe ao descer e reaparece ao subir.
  // Limiares evitam oscilações em pequenos movimentos e mantêm a barra acessível
  // quando o usuário interage com campos ou navega pelo teclado.
  useEffect(() => {
    const direction = scrollDirectionRef.current;
    direction.lastY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);

    const handleScroll = () => {
      const currentY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
      const delta = currentY - direction.lastY;
      direction.lastY = currentY;

      if (currentY <= 24) {
        direction.down = 0;
        direction.up = 0;
        setNavigationHidden(false);
        return;
      }

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.closest(".bottom-nav")) {
        direction.down = 0;
        direction.up = 0;
        setNavigationHidden(false);
        return;
      }
      if (activeElement instanceof HTMLElement && activeElement.matches("input, textarea, select, [contenteditable='true']")) {
        direction.down = 0;
        direction.up = 0;
        setNavigationHidden(false);
        return;
      }

      if (Math.abs(delta) < 2) return;
      if (delta > 0) {
        direction.down += delta;
        direction.up = 0;
        if (direction.down >= 32) {
          setNavigationHidden(true);
          direction.down = 0;
        }
      } else {
        direction.up += Math.abs(delta);
        direction.down = 0;
        if (direction.up >= 14) {
          setNavigationHidden(false);
          direction.up = 0;
        }
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".bottom-nav, input, textarea, select, [contenteditable='true']")) {
        setNavigationHidden(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, []);

  useEffect(() => {
    setNavigationHidden(false);
    scrollDirectionRef.current.down = 0;
    scrollDirectionRef.current.up = 0;
  }, [activeTab]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true); }
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setNotice("");
      if (!nextSession || event === "SIGNED_IN") {
        setProfile(null); setAlerts([]); setRadarFires([]); setAccounts([]); setCards([]); setCategories([]); setRecurrences([]); setBudgets([]); setGoals([]); setGoalContributions([]); setInvestmentAssets([]); setInvestmentOperations([]); setManualPriceInputs({}); setIncomeEvents([]); setPushSubscriptions([]); setWhatsappLink(null); setWhatsappLinkCode(""); setWhatsappSummaryEnabled(false); setIncomeAssetId(""); setIncomeAmount(""); setIncomeReferenceDate(todayInBrazil()); setIncomePaymentDate(""); setInvestmentSymbol(""); setInvestmentName(""); setInvestmentAssetId(""); setInvestmentQuantity(""); setInvestmentUnitPrice(""); setInvestmentFees("0,00"); setInvestmentDate(todayInBrazil()); setFixedIncomeProduct("CDB"); setFixedIncomeIssuer(""); setFixedIncomeIndexer("CDI"); setFixedIncomeRate(""); setFixedIncomeMaturity(""); setFixedIncomeNextYieldDate(""); setFixedIncomeStart(todayInBrazil()); setFixedIncomeFrequency("daily"); setAccountInstitutionKey(""); setGoalName(""); setGoalTarget(""); setGoalMonthly("0,00"); setGoalTargetMonth(""); setGoalContributionAmounts({}); setImportFormat("CSV"); setImportDestinationType("account"); setImportDestinationId(""); setImportFileName(""); setImportPreview([]); setBudgetSpend([]); setTransactions([]); setTxCategoryId(""); setBudgetCategoryId(""); setBudgetLimit(""); setRecurrenceCategoryId(""); setRecurrenceAccountId(""); setRecurrenceCardId(""); setRecurrenceName(""); setRecurrenceAmount(""); setRecurrenceEnd(""); setRecurrenceStart(todayInBrazil());
        setTxAccountId(""); setTxCardId(""); setTxInstallmentCount("1"); setReceiptAccountId(""); setEditingTransactionId(null);
        setAssistantAnswer(""); setAssistantQuestion(""); setAssistantConsent(false);
        setReceiptDraft(null); setReceiptFile(null); setReceiptFiles([]); setReceiptConsent(false);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !session) return;
    let active = true;
    const load = async () => {
      try {
        const [account, preferences, radar, radarFireRows, pushRows, whatsappRows, receiptFileRows, accountRows, transactionRows, cardRows, invoicePaymentRows, cardInvoiceInstallmentRows, categoryRows, recurrenceRows, budgetRows, budgetSpendRows, goalRows, goalContributionRows, investmentAssetRows, investmentOperationRows, incomeEventRows, incomeEventSettlementRows] = await Promise.all([
          client.functions.invoke("minha-conta", { body: { action: "consultar" } }),
          client.functions.invoke("minhas-preferencias", { body: { action: "consultar" } }),
          client.functions.invoke("radar-alertas", { body: { action: "consultar" } }),
          client.functions.invoke("radar-alertas", { body: { action: "consultar_disparos" } }),
          client.functions.invoke("push-inscricoes", { body: { action: "consultar" } }),
          client.functions.invoke("whatsapp-vincular", { body: { action: "consultar" } }),
          client.from("receipt_files").select("id,transaction_id,storage_path,mime_type,byte_size,created_at").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(100),
          client.from("accounts").select("id,name,account_type,opening_balance,opening_balance_date,is_primary,institution_name,institution_code,institution_logo_key").eq("user_id", session.user.id).eq("is_archived", false).order("created_at", { ascending: true }),
          client.from("transactions").select("id,kind,status,payment_method,amount,transaction_date,description,account_id,card_id,transfer_from_account_id,transfer_to_account_id,category_id").eq("user_id", session.user.id).order("transaction_date", { ascending: false }).limit(10000),
          client.from("cards").select("id,name,institution_name,last_four,brand,credit_limit,closing_day,due_day,is_archived").eq("user_id", session.user.id).eq("is_archived", false).order("created_at", { ascending: true }),
          client.from("card_invoice_payments").select("id,card_id,account_id,invoice_closing_date,amount,payment_date,description").eq("user_id", session.user.id).order("payment_date", { ascending: false }).limit(10000),
          client.from("card_invoice_installments").select("id,transaction_id,card_id,invoice_closing_date,invoice_due_date,installment_number,installment_count,amount").eq("user_id", session.user.id).order("invoice_closing_date", { ascending: true }).limit(10000),
          client.from("categories").select("id,name,kind,color,icon").eq("user_id", session.user.id).order("kind", { ascending: true }).order("name", { ascending: true }),
          client.from("recurrence_rules").select("id,name,kind,amount,frequency,interval_count,weekday,month_day,month_of_year,starts_on,ends_on,next_occurrence_on,account_id,card_id,is_active").eq("user_id", session.user.id).order("next_occurrence_on", { ascending: true }),
          client.from("budgets").select("id,category_id,year,month,limit_amount").eq("user_id", session.user.id).eq("year", currentBudgetYear).eq("month", currentBudgetMonth).order("created_at", { ascending: true }),
          client.from("transactions").select("category_id,settled_amount").eq("user_id", session.user.id).eq("kind", "expense").eq("status", "paid").gte("transaction_date", currentBudgetMonthStart).lt("transaction_date", nextBudgetMonthStart).limit(10000),
          client.from("goals").select("id,name,target_amount,current_amount,monthly_contribution,target_month").eq("user_id", session.user.id).order("created_at", { ascending: true }),
          client.from("goal_contributions").select("id,goal_id,amount,contribution_date,source,created_at").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(100),
          client.from("investment_assets").select("id,symbol,name,asset_class,currency,current_price,price_as_of,price_source,metadata").eq("user_id", session.user.id).order("symbol", { ascending: true }),
          client.from("investment_operations").select("id,asset_id,operation_type,operation_date,quantity,unit_price,gross_amount,fees").eq("user_id", session.user.id).in("operation_type", ["opening","buy","sell"]).order("operation_date", { ascending: true }),
          client.from("income_events").select("id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status").eq("user_id", session.user.id).order("reference_date", { ascending: false }),
          client.from("income_events").select("id,account_id,transaction_id,settlement_state").eq("user_id", session.user.id),
        ]);
        if (account.error) throw account.error;
        if (preferences.error) throw preferences.error;
        if (radar.error) throw radar.error;
        if (radarFireRows.error) throw radarFireRows.error;
        if (pushRows.error) throw pushRows.error;
        if (whatsappRows.error) throw whatsappRows.error;
        if (receiptFileRows.error) throw receiptFileRows.error;
        if (invoicePaymentRows.error) throw invoicePaymentRows.error;
        if (accountRows.error) throw accountRows.error;
        if (transactionRows.error) throw transactionRows.error;
        if (cardRows.error) throw cardRows.error;
        if (categoryRows.error) throw categoryRows.error;
        if (recurrenceRows.error) throw recurrenceRows.error;
        if (budgetRows.error) throw budgetRows.error;
        if (budgetSpendRows.error) throw budgetSpendRows.error;
        if (goalRows.error) throw goalRows.error;
        if (goalContributionRows.error) throw goalContributionRows.error;
        if (investmentAssetRows.error) throw investmentAssetRows.error;
        if (investmentOperationRows.error) throw investmentOperationRows.error;
        if (incomeEventRows.error) throw incomeEventRows.error;
        if (!active) return;
        setProfile(account.data?.data?.profile ?? null);
        const serverTheme = preferences.data?.data?.theme;
        if (serverTheme === "light" || serverTheme === "dark") setTheme(serverTheme);
        setAlerts(Array.isArray(radar.data?.data) ? radar.data.data as RadarAlert[] : []);
        setRadarFires(Array.isArray(radarFireRows.data?.data) ? radarFireRows.data.data as RadarFireRow[] : []);
        setAccounts((accountRows.data ?? []) as AccountRow[]);
        setCards((cardRows.data ?? []) as CardRow[]);
        setInvoicePayments((invoicePaymentRows.data ?? []) as CardInvoicePaymentRow[]);
        setCardInstallments(cardInvoiceInstallmentRows.error ? [] : (cardInvoiceInstallmentRows.data ?? []) as CardInvoiceInstallmentRow[]);
        if (cardRows.data?.[0]?.id) setInvoicePaymentCardId((current) => current || cardRows.data[0].id);
        if (accountRows.data?.[0]?.id) setInvoicePaymentAccountId((current) => current || accountRows.data[0].id);
        setCategories((categoryRows.data ?? []) as CategoryRow[]);
        setRecurrences((recurrenceRows.data ?? []) as RecurrenceRow[]);
        setBudgets((budgetRows.data ?? []) as BudgetRow[]);
        setBudgetSpend((budgetSpendRows.data ?? []) as BudgetSpendRow[]);
        setGoals((goalRows.data ?? []) as GoalRow[]);
        setGoalContributions((goalContributionRows.data ?? []) as GoalContributionRow[]);
        setInvestmentAssets((investmentAssetRows.data ?? []) as InvestmentAssetRow[]);
        setInvestmentOperations((investmentOperationRows.data ?? []) as InvestmentOperationRow[]);
        setIncomeSettlementReady(!incomeEventSettlementRows.error);
        const settlementById = new Map((incomeEventSettlementRows.data ?? []).map((row) => [row.id, row]));
        setIncomeEvents(((incomeEventRows.data ?? []) as Omit<IncomeEventRow, "account_id" | "transaction_id" | "settlement_state">[]).map((row) => ({
          ...row,
          ...(settlementById.get(row.id) ?? { account_id: null, transaction_id: null, settlement_state: "unsettled" as const }),
        })));
        setPushSubscriptions((pushRows.data?.data ?? []) as PushSubscriptionRow[]);
        setWhatsappLink(whatsappRows.data?.data?.linked ? { phone: whatsappRows.data.data.phone, weekly_summary_enabled: whatsappRows.data.data.weekly_summary_enabled } : null);
        setWhatsappSummaryEnabled(Boolean(whatsappRows.data?.data?.weekly_summary_enabled));
        setReceiptFiles((receiptFileRows.data ?? []) as ReceiptFileRow[]);
        if (investmentAssetRows.data?.[0]?.id) setIncomeAssetId((current) => current || investmentAssetRows.data[0].id);
        if (investmentAssetRows.data?.[0]?.id) setInvestmentAssetId((current) => current || investmentAssetRows.data[0].id);
        setTransactions((transactionRows.data ?? []) as TransactionRow[]);
        const firstLiquidAccount = accountRows.data?.find((account) => account.account_type !== "investment");
        if (firstLiquidAccount?.id) setTxAccountId((current) => current || firstLiquidAccount.id);
        if (firstLiquidAccount?.id) setReceiptAccountId((current) => current || firstLiquidAccount.id);
        if (firstLiquidAccount?.id) setImportDestinationId((current) => current || firstLiquidAccount.id);
      } catch (error) {
        if (active) setNotice(errorMessage(error));
      }
    };
    void load();
    return () => { active = false; };
  }, [session, currentBudgetYear, currentBudgetMonth, currentBudgetMonthStart, nextBudgetMonthStart]);

  const signedIn = Boolean(session?.user);
  const ledgerEntries = useMemo<LedgerEntry[]>(() => [
    ...transactions.map((item): LedgerEntry => ({
      id: item.id,
      kind: item.card_id ? "card_expense" : item.kind,
      status: item.status,
      amountCents: Math.round(Number(item.amount) * 100),
      date: item.transaction_date,
      accountId: item.account_id,
      cardId: item.card_id,
      transferFromAccountId: item.transfer_from_account_id,
      transferToAccountId: item.transfer_to_account_id,
      categoryId: item.category_id,
    })),
    ...invoicePayments.map((payment): LedgerEntry => ({
      id: payment.id, kind: "card_payment", status: "paid",
      amountCents: Math.round(Number(payment.amount) * 100), date: payment.payment_date,
      accountId: payment.account_id, cardId: payment.card_id,
    })),
  ], [transactions, invoicePayments]);
  const cardInvoiceEntries = useMemo<LedgerEntry[]>(() => {
    if (cardInstallments.length === 0) return ledgerEntries;
    const nonCardEntries = ledgerEntries.filter((entry) => entry.kind !== "card_expense");
    const installmentEntries = cardInstallments.map((item): LedgerEntry => ({
      id: `${item.transaction_id}:${item.installment_number}`,
      kind: "card_expense",
      status: "paid",
      amountCents: Number(decimalToCents(item.amount)),
      date: item.invoice_closing_date,
      cardId: item.card_id,
    }));
    return [...nonCardEntries, ...installmentEntries];
  }, [ledgerEntries, cardInstallments]);
  const accountBalances = useMemo(() => {
    if (ledgerAccountBalances !== null) return ledgerAccountBalances;
    return Object.fromEntries(accounts.map((account) => [
      account.id,
      calculateAccountBalance(
        Math.round(Number(account.opening_balance) * 100),
        account.id,
        ledgerEntries.filter((entry) => entry.date >= account.opening_balance_date),
        currentBudgetDate
      ) / 100,
    ]));
  }, [ledgerAccountBalances, accounts, ledgerEntries, currentBudgetDate]);
  const paymentsByCardInvoice = useMemo(() => {
    const grouped = new Map<string, InvoicePayment[]>();
    for (const payment of invoicePayments) {
      const key = `${payment.card_id}:${payment.invoice_closing_date}`;
      const rows = grouped.get(key) ?? [];
      rows.push({ amountCents: Math.round(Number(payment.amount) * 100), date: payment.payment_date, accountId: payment.account_id });
      grouped.set(key, rows);
    }
    return grouped;
  }, [invoicePayments]);
  const cardCommittedAmounts = useMemo(() => Object.fromEntries(cards.map((card) => {
    const payments = new Map<string, readonly InvoicePayment[]>();
    for (const [key, rows] of paymentsByCardInvoice) {
      if (key.startsWith(`${card.id}:`)) payments.set(key.slice(card.id.length + 1), rows);
    }
    return [card.id, calculateCardCommittedLimitCents(card.id, card.closing_day, card.due_day, cardInvoiceEntries, payments, currentBudgetDate) / 100];
  })), [cards, cardInvoiceEntries, paymentsByCardInvoice, currentBudgetDate]);
  const enabledAlerts = useMemo(() => alerts.filter((alert) => alert.is_enabled).length, [alerts]);
  useEffect(() => {
    if (!supabase || !session?.user) {
      setFinancialSummary(null);
      return;
    }
    let active = true;
    void supabase.rpc("get_financial_summary").then(({ data, error }) => {
      if (!active) return;
      if (error || !data || typeof data !== "object") {
        setFinancialSummary(null);
        return;
      }
      setFinancialSummary(data as { receivables_brl?: number; overtime_forecast_brl?: number });
    });
    return () => { active = false; };
  }, [session, transactions, investmentAssets, investmentOperations]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setLedgerAccountBalances(null);
      return;
    }
    let active = true;
    void supabase.rpc("get_account_balances", { p_as_of: currentBudgetDate }).then(({ data, error }) => {
      if (!active || error || !Array.isArray(data)) return;
      if (data.length === 0 && accounts.length > 0) return;
      const next: Record<string, number> = {};
      for (const row of data as AccountBalanceRpcRow[]) {
        if (!row.account_id) continue;
        const value = Number(row.balance);
        if (!Number.isFinite(value)) continue;
        next[row.account_id] = toCents(value) / 100;
      }
      setLedgerAccountBalances(next);
    });
    return () => { active = false; };
  }, [session, accounts, transactions, invoicePayments, investmentOperations, incomeEvents, ledgerRefreshVersion, currentBudgetDate]);


  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      if (authMode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { name: displayName.trim() } },
        });
        if (error) throw error;
        if (!data.session) setNotice("Cadastro recebido. Confirme seu e-mail para entrar.");
      }
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function exportPersonalData() {
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.functions.invoke("exportar-dados", { body: { action: "exportar" } });
      if (error) throw error;
      if (!data?.data?.tables || data.data.user?.id !== session?.user.id) {
        throw new Error("A exportação não foi confirmada pelo servidor.");
      }
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `granaviva-export-${todayInBrazil()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setNotice("Exportação dos seus dados preparada.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function deletePersonalAccount() {
    if (!supabase || !session || deleteConfirmText !== "EXCLUIR_CONTA") return;
    const userId = session.user.id;
    setBusy(true); setNotice("");
    try {
      const { error } = await supabase.functions.invoke("excluir-conta", {
        body: { confirmation: "EXCLUIR_CONTA" },
      });
      if (error) throw error;
      let localDataCleared = true;
      try { await clearFinancialRecordsForUser(userId); }
      catch { localDataCleared = false; }
      await supabase.auth.signOut({ scope: "local" });
      setDeleteConfirmText("");
      setNotice(localDataCleared
        ? "Conta excluída permanentemente."
        : "Conta excluída no servidor, mas não foi possível limpar o cache financeiro deste dispositivo.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function handleSignOut() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    setNotice(error ? errorMessage(error) : "Sessão encerrada.");
  }

  async function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (supabase && session) {
      const { error } = await supabase.functions.invoke("minhas-preferencias", {
        body: { action: "atualizar", theme: next },
      });
      if (error) setNotice("Tema alterado neste dispositivo, mas não foi possível sincronizar com sua conta.");
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(openingBalance, true, true);
    if (!amount || !accountName.trim()) { setNotice("Confira o nome e o saldo inicial da conta."); return; }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("accounts").insert({
        user_id: session.user.id, name: accountName.trim(), account_type: accountType,
        institution_name: BANK_CATALOG.find((bank) => bank.logoKey === accountInstitutionKey)?.name ?? null,
        institution_code: BANK_CATALOG.find((bank) => bank.logoKey === accountInstitutionKey)?.code || null,
        institution_logo_key: accountInstitutionKey || null,
        opening_balance: amount, opening_balance_date: todayInBrazil(),
        is_primary: accounts.length === 0,
      }).select("id,name,account_type,opening_balance,opening_balance_date,is_primary,institution_name,institution_code,institution_logo_key").single();
      if (error) throw error;
      const created = data as AccountRow;
      setAccounts((current) => [...current, created]);
      if (created.account_type !== "investment") {
        setTxAccountId((current) => current || created.id);
        setReceiptAccountId((current) => current || created.id);
      }
      setAccountName("");
      setAccountInstitutionKey("");
      setOpeningBalance("0,00");
      setNotice("Conta criada.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const limit = normalizeBrlAmount(cardLimit, true);
    const closing = Number(cardClosingDay);
    const due = Number(cardDueDay);
    if (!cardName.trim() || !cardInstitution.trim() || !/^\d{4}$/.test(cardLastFour) ||
        !limit || !Number.isInteger(closing) || closing < 1 || closing > 31 ||
        !Number.isInteger(due) || due < 1 || due > 31) {
      setNotice("Confira nome, instituição, últimos quatro dígitos, limite e dias de fechamento/vencimento.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("cards").insert({
        user_id: session.user.id, name: cardName.trim(), institution_name: cardInstitution.trim(),
        last_four: cardLastFour, credit_limit: limit, closing_day: closing, due_day: due,
      }).select("id,name,institution_name,last_four,brand,credit_limit,closing_day,due_day,is_archived").single();
      if (error) throw error;
      setCards((current) => [...current, data as CardRow]);
      setCardName(""); setCardInstitution(""); setCardLastFour(""); setCardLimit("0,00");
      setNotice("Cartão cadastrado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function archiveCard(card: CardRow) {
    if (!supabase || !session || !window.confirm(`Arquivar o cartão ${card.name} final ${card.last_four}?`)) return;
    setBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("cards").update({ is_archived: true })
        .eq("id", card.id).eq("user_id", session.user.id);
      if (error) throw error;
      setCards((current) => current.filter((item) => item.id !== card.id));
      setNotice("Cartão arquivado. O histórico financeiro foi preservado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !categoryName.trim()) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("categories").insert({
        user_id: session.user.id, name: categoryName.trim(), kind: categoryKind,
      }).select("id,name,kind,color,icon").single();
      if (error) throw error;
      setCategories((current) => [...current, data as CategoryRow].sort((a,b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "pt-BR")));
      setCategoryName("");
      setNotice("Categoria criada.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function refreshBudgetSpend() {
    if (!supabase || !session) return;
    const { data, error } = await supabase.from("transactions")
      .select("category_id,settled_amount").eq("user_id", session.user.id)
      .eq("kind", "expense").eq("status", "paid")
      .gte("transaction_date", currentBudgetMonthStart).lt("transaction_date", nextBudgetMonthStart)
      .limit(10000);
    if (error) {
      setNotice("Lançamento salvo, mas não foi possível atualizar os orçamentos. Atualize a tela para sincronizar.");
      return;
    }
    setBudgetSpend((data ?? []) as BudgetSpendRow[]);
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const limit = normalizeBrlAmount(budgetLimit);
    const category = categories.find((item) => item.id === budgetCategoryId && item.kind === "expense");
    if (!category || !limit) {
      setNotice("Selecione uma categoria de despesa e informe um limite mensal válido.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("budgets").upsert({
        user_id: session.user.id, category_id: category.id,
        year: currentBudgetYear, month: currentBudgetMonth, limit_amount: limit,
      }, { onConflict: "user_id,category_id,year,month" })
        .select("id,category_id,year,month,limit_amount").single();
      if (error) throw error;
      setBudgets((current) => [...current.filter((item) => item.category_id !== category.id), data as BudgetRow]
        .sort((a,b) => a.category_id.localeCompare(b.category_id)));
      setBudgetLimit("");
      setNotice("Limite mensal salvo. O acompanhamento considera apenas despesas realizadas.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function generateWhatsappLinkCode() {
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-vincular", { body: { action: "gerar_codigo" } });
      if (error) throw error;
      if (typeof data?.data?.code !== "string") throw new Error("O backend não confirmou o código.");
      setWhatsappLinkCode(data.data.code);
      setWhatsappSummaryEnabled(false);
      setNotice("Código gerado. A vinculação só será concluída quando o provedor e o número oficial estiverem configurados.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function saveWhatsappSummaryPreference() {
    if (!supabase || !whatsappLink) return;
    setBusy(true); setNotice("");
    try {
      const { error } = await supabase.functions.invoke("whatsapp-vincular", {
        body: { action: "resumo", enabled: whatsappSummaryEnabled },
      });
      if (error) throw error;
      setWhatsappLink((current) => current ? { ...current, weekly_summary_enabled: whatsappSummaryEnabled } : current);
      setNotice(whatsappSummaryEnabled ? "Consentimento para o resumo semanal ativado." : "Resumo semanal desativado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function unlinkWhatsapp() {
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      const { error } = await supabase.functions.invoke("whatsapp-vincular", { body: { action: "desvincular" } });
      if (error) throw error;
      setWhatsappLink(null); setWhatsappLinkCode(""); setWhatsappSummaryEnabled(false);
      setNotice("WhatsApp desvinculado e resumos desativados.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function togglePushNotifications() {
    if (!supabase || !session) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setNotice("Este navegador não oferece suporte a notificações Push.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const permissionRequest = Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        const stored = pushSubscriptions.find((item) => item.endpoint === current.endpoint);
        if (stored) {
          const { error } = await supabase.functions.invoke("push-inscricoes", { body: { action: "remover", id: stored.id } });
          if (error) throw error;
        }
        await current.unsubscribe();
        const remaining = pushSubscriptions.filter((item) => item.endpoint !== current.endpoint);
        setPushSubscriptions(remaining);
        if (remaining.length === 0) {
          const { error } = await supabase.functions.invoke("minhas-preferencias", {
            body: { action: "atualizar", push_enabled: false },
          });
          if (error) throw error;
        }
        setNotice("Notificações desativadas neste dispositivo.");
        return;
      }
      const permission = await permissionRequest;
      if (permission !== "granted") throw new Error("Permissão de notificações não concedida.");
      const vapid = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY;
      if (typeof vapid !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(vapid)) {
        throw new Error("A chave pública VAPID ainda não foi configurada neste ambiente.");
      }
      const normalized = vapid.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
      const key = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: key.buffer as ArrayBuffer,
      });
      const p256dh = subscription.getKey("p256dh");
      const authKey = subscription.getKey("auth");
      if (!p256dh || !authKey) { await subscription.unsubscribe(); throw new Error("O navegador não forneceu as chaves da inscrição Push."); }
      const encode = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const { data, error } = await supabase.functions.invoke("push-inscricoes", {
        body: { action: "registrar", endpoint: subscription.endpoint,
          p256dh: encode(p256dh), auth_key: encode(authKey), user_agent: navigator.userAgent },
      });
      if (error || !data?.data?.id) {
        await subscription.unsubscribe();
        throw error ?? new Error("O backend não confirmou a inscrição.");
      }
      const { error: settingsError } = await supabase.functions.invoke("minhas-preferencias", {
        body: { action: "atualizar", push_enabled: true },
      });
      if (settingsError) {
        await supabase.functions.invoke("push-inscricoes", { body: { action: "remover", id: data.data.id } });
        await subscription.unsubscribe();
        throw settingsError;
      }
      setPushSubscriptions((items) => [...items.filter((item) => item.endpoint !== subscription.endpoint), data.data]);
      setNotice("Notificações ativadas neste dispositivo.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function previewStatementFile(file?: File) {
    if (!file || !supabase || !session) return;
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setNotice("O arquivo deve ter até 5 MB.");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "ofx") {
      setNotice("Selecione um arquivo .CSV ou .OFX.");
      return;
    }
    const format = extension.toUpperCase() as "CSV" | "OFX";
    if (format !== importFormat) setImportFormat(format);
    const destinationExists = importDestinationType === "account"
      ? accounts.some((item) => item.id === importDestinationId)
      : cards.some((item) => item.id === importDestinationId);
    if (!destinationExists) {
      setNotice("Selecione uma conta ou cartão de destino antes de gerar a prévia.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const content = await file.text();
      const parsed = format === "CSV" ? parseCsvStatement(content) : parseOfxStatement(content);
      if (importDestinationType === "card" && parsed.some((row) => row.kind !== "expense")) {
        throw new Error("Extratos de cartão só podem ser importados como despesas nesta versão. Escolha uma conta para receitas.");
      }
      const existing = await supabase.from("import_items").select("dedupe_key")
        .eq("user_id", session.user.id).eq("destination_type", importDestinationType)
        .eq("destination_id", importDestinationId).limit(10000);
      if (existing.error) throw existing.error;
      const mapped = parsed.map((row) => ({
        ...row, destinationType: importDestinationType, destinationId: importDestinationId,
      }));
      const decisions = planImportBatch(mapped, new Set((existing.data ?? []).map((item) => item.dedupe_key)));
      setImportPreview(decisions.map((decision) => ({
        ...decision.row, dedupeKey: decision.dedupeKey, duplicate: decision.result === "duplicate",
      })));
      setImportFileName(file.name.slice(0, 255));
      setImportFormat(format);
      setNotice(`Prévia pronta: ${parsed.length} lançamentos, ${decisions.filter((item) => item.result === "duplicate").length} duplicados.`);
    } catch (error) {
      setImportPreview([]); setImportFileName("");
      setNotice(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function confirmStatementImport() {
    if (!supabase || !session || !importPreview.length) return;
    const destinationExists = importDestinationType === "account"
      ? accounts.some((item) => item.id === importDestinationId)
      : cards.some((item) => item.id === importDestinationId);
    if (!destinationExists) { setNotice("O destino selecionado não está mais disponível."); return; }
    const candidates = importPreview.filter((row) => !row.duplicate);
    if (!candidates.length) { setNotice("Todos os lançamentos desta prévia já foram importados."); return; }
    setBusy(true); setNotice("");
    let batchId: string | null = null;
    const createdTransactionIds: string[] = [];
    const createdTransactionRows: TransactionRow[] = [];
    try {
      const { data: batch, error: batchError } = await supabase.from("import_batches").insert({
        user_id: session.user.id, format: importFormat, destination_type: importDestinationType,
        destination_id: importDestinationId, file_name: importFileName,
        imported_count: importPreview.length,
        ignored_count: importPreview.filter((row) => row.duplicate).length,
        status: "preview",
      }).select("id").single();
      if (batchError || !batch) throw batchError ?? new Error("Não foi possível iniciar o lote.");
      batchId = batch.id;
      let imported = 0;
      let ignored = importPreview.filter((row) => row.duplicate).length;
      for (const row of candidates) {
        const amount = `${Math.floor(row.amountCents / 100)}.${String(row.amountCents % 100).padStart(2,"0")}`;
        const transactionInput = {
          user_id: session.user.id, kind: row.kind, status: "paid", amount,
          transaction_date: row.date, description: row.description.slice(0,240),
          account_id: importDestinationType === "account" ? importDestinationId : null,
          card_id: importDestinationType === "card" ? importDestinationId : null,
          settled_amount: amount, settled_at: row.date, import_batch_id: batchId,
          source: "import", external_reference: row.sourceId,
        };
        const { data: transaction, error: transactionError } = await supabase.from("transactions")
          .insert(transactionInput).select("id,kind,status,amount,transaction_date,description,account_id,card_id,transfer_from_account_id,transfer_to_account_id,category_id").single();
        if (transactionError || !transaction) throw transactionError ?? new Error("Não foi possível criar um lançamento importado.");
        createdTransactionIds.push(transaction.id);
        createdTransactionRows.push(transaction as TransactionRow);
        const { error: itemError } = await supabase.from("import_items").insert({
          user_id: session.user.id, batch_id: batchId, transaction_id: transaction.id,
          destination_type: importDestinationType, destination_id: importDestinationId,
          dedupe_key: row.dedupeKey, source_reference: row.sourceId,
          snapshot: {}, result: "created",
        });
        if (itemError?.code === "23505") {
          const { error: removeError } = await supabase.from("transactions").delete()
            .eq("id", transaction.id).eq("user_id", session.user.id);
          if (removeError) throw removeError;
          createdTransactionIds.pop();
          createdTransactionRows.pop();
          ignored++;
          continue;
        }
        if (itemError) throw itemError;
        imported++;
      }
      const { error: finalizeError } = await supabase.from("import_batches").update({
        imported_count: imported + ignored, ignored_count: ignored, status: "committed",
      }).eq("id", batchId).eq("user_id", session.user.id);
      if (finalizeError) throw finalizeError;
      setTransactions((current) => [...createdTransactionRows, ...current]);
      setImportPreview([]); setImportFileName("");
      setNotice(`Importação concluída: ${imported} lançamentos criados e ${ignored} duplicados ignorados.`);
    } catch (error) {
      if (batchId) {
        await supabase.from("import_items").delete().eq("batch_id", batchId).eq("user_id", session.user.id);
        if (createdTransactionIds.length) {
          await supabase.from("transactions").delete().in("id", createdTransactionIds).eq("user_id", session.user.id);
        }
        await supabase.from("import_batches").delete().eq("id", batchId).eq("user_id", session.user.id);
      }
      setNotice(`Importação cancelada e revertida: ${errorMessage(error)}`);
    } finally { setBusy(false); }
  }

  async function createIncomeEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(incomeAmount);
    const selectedIncomeAsset = investmentAssets.find((asset) => asset.id === incomeAssetId);
    if (!selectedIncomeAsset || !amount || !incomeReferenceDate ||
        (incomePaymentDate && incomePaymentDate < incomeReferenceDate) ||
        (["announced", "planned", "received"].includes(incomeStatus) && !incomePaymentDate) ||
        (incomeStatus === "received" && !incomeSettlementReady) ||
        (incomeStatus === "received" && !incomeDestinationAccountId) ||
        (incomeStatus === "received" && selectedIncomeAsset.currency !== "BRL")) {
      setNotice(incomeStatus === "received" && !incomeSettlementReady
        ? "A liquidação de proventos será habilitada quando a migration financeira estiver ativa no banco."
        : incomeStatus === "received" && selectedIncomeAsset?.currency === "USD"
          ? "Proventos em USD ficam registrados como previstos até existir uma conta USD e conversão cambial explícita."
          : "Confira o ativo, valor, datas e a conta de destino do recebimento.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const eventPayload = {
        user_id: session.user.id, asset_id: incomeAssetId, event_type: incomeEventType,
        reference_date: incomeReferenceDate, payment_date: incomePaymentDate || null,
        announced_amount: amount, received_amount: incomeStatus === "received" ? amount : "0.00",
        status: incomeStatus,
      };
      let data: unknown;
      let error: { message: string } | null;
      if (incomeSettlementReady) {
        const result = await supabase.from("income_events").insert({
          ...eventPayload,
          account_id: incomeStatus === "received" ? incomeDestinationAccountId : null,
          settlement_idempotency_key: incomeStatus === "received" ? crypto.randomUUID() : null,
        }).select("id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status,account_id,transaction_id,settlement_state").single();
        data = result.data; error = result.error;
      } else {
        const result = await supabase.from("income_events").insert(eventPayload)
          .select("id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status").single();
        data = result.data; error = result.error;
      }
      if (error) throw error;
      setIncomeEvents((current) => [{ ...(data as IncomeEventRow), settlement_state: (data as IncomeEventRow).settlement_state ?? "unsettled" }, ...current]);
      setIncomeAmount(""); setIncomePaymentDate(""); setIncomeDestinationAccountId("");
      setNotice("Provento registrado no histórico da carteira.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createInvestmentAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const symbolValue = investmentSymbol.trim().toUpperCase();
    const nameValue = investmentName.trim();
    if (!/^[A-Z0-9.]{1,32}$/.test(symbolValue) || !nameValue || nameValue.length > 120) {
      setNotice("Informe um ticker válido e o nome do ativo.");
      return;
    }
    const fixedRate = fixedIncomeRate.trim().replace(",", ".");
    if (investmentClass === "fixed_income" && (!fixedIncomeProduct.trim() || !fixedIncomeStart ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fixedIncomeStart) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fixedIncomeMaturity) || fixedIncomeMaturity <= fixedIncomeStart ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fixedIncomeNextYieldDate) ||
        fixedIncomeNextYieldDate < fixedIncomeStart || fixedIncomeNextYieldDate > fixedIncomeMaturity ||
        !/^[0-9]{1,3}(?:[.][0-9]{1,4})?$/.test(fixedRate) || Number(fixedRate) <= 0 || Number(fixedRate) > 1000)) {
      setNotice("Confira o produto, indexador, taxa e datas da renda fixa.");
      return;
    }
    const metadata = investmentClass === "fixed_income" ? {
      fixed_income: {
        product: fixedIncomeProduct, issuer: fixedIncomeIssuer.trim(), indexer: fixedIncomeIndexer,
        annual_rate_percent: fixedRate, start_date: fixedIncomeStart, maturity_date: fixedIncomeMaturity,
        next_yield_date: fixedIncomeNextYieldDate, yield_frequency: fixedIncomeFrequency,
      },
    } : {};
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("investment_assets").insert({
        user_id: session.user.id, symbol: symbolValue, name: nameValue,
        asset_class: investmentClass, currency: investmentCurrency, metadata,
      }).select("id,symbol,name,asset_class,currency,current_price,price_as_of,price_source,metadata").single();
      if (error) throw error;
      const created = data as InvestmentAssetRow;
      setInvestmentAssets((current) => [...current, created].sort((a,b) => a.symbol.localeCompare(b.symbol)));
      setInvestmentAssetId(created.id);
      setInvestmentSymbol(""); setInvestmentName("");
      setFixedIncomeIssuer(""); setFixedIncomeRate(""); setFixedIncomeMaturity("");
      setFixedIncomeNextYieldDate(""); setFixedIncomeStart(todayInBrazil());
      setNotice("Ativo adicionado à carteira. A cotação ainda não está conectada.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function updateManualInvestmentPrice(event: FormEvent<HTMLFormElement>, asset: InvestmentAssetRow) {
    event.preventDefault();
    if (!supabase || !session) return;
    const raw = normalizeManualReferencePrice(manualPriceInputs[asset.id] ?? "");
    if (raw === null) {
      setNotice("Informe um preço positivo com até 8 casas decimais.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const observedAt = new Date().toISOString();
      const { data, error } = await supabase.from("investment_assets")
        .update({ current_price: raw, price_as_of: observedAt, price_source: "manual" })
        .eq("id", asset.id).eq("user_id", session.user.id)
        .select("id,current_price,price_as_of,price_source").single();
      if (error) throw error;
      setInvestmentAssets((current) => current.map((item) => item.id === asset.id
        ? { ...item, current_price: data.current_price, price_as_of: data.price_as_of, price_source: "manual" }
        : item));
      setManualPriceInputs((current) => ({ ...current, [asset.id]: "" }));
      setNotice("Preço de referência manual atualizado. Ele não altera operações, custo médio ou alertas do Radar.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createInvestmentOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const quantityInput = investmentQuantity.trim().replace(",", ".");
    const quantityValid = /^\\d{1,10}(?:\\.\\d{1,8})?$/.test(quantityInput);
    const [quantityWhole = "0", quantityFraction = ""] = quantityInput.split(".");
    const quantityAtoms = quantityValid
      ? BigInt(quantityWhole) * 100_000_000n + BigInt(quantityFraction.padEnd(8, "0"))
      : 0n;
    const quantity = Number(quantityAtoms) / 100_000_000;
    const quantityNormalized = `${quantityWhole}.${quantityFraction.padEnd(8, "0")}`;
    const unitPrice = normalizeBrlAmount(investmentUnitPrice);
    const fees = normalizeBrlAmount(investmentFees, true);
    const asset = investmentAssets.find((item) => item.id === investmentAssetId);
    if (!asset || quantityAtoms <= 0n || quantityAtoms > 1000000000n * 100_000_000n ||
        !unitPrice || !fees || !investmentDate) {
      setNotice("Confira ativo, quantidade, preço, taxas e data da operação.");
      return;
    }
    const unitPriceCents = decimalToCents(unitPrice);
    const grossCents = (quantityAtoms * unitPriceCents + 50_000_000n) / 100_000_000n;
    const feeCents = decimalToCents(fees);
    if (grossCents <= 0n || grossCents > 99999999999999n || feeCents > 99999999999999n || (investmentOperationType === "sell" && grossCents < feeCents)) {
      setNotice("O valor bruto deve caber no limite financeiro e cobrir as taxas da operação.");
      return;
    }
    const gross = `${grossCents / 100n}.${String(grossCents % 100n).padStart(2, "0")}`;
    const currentSummary = investmentSummary(asset.id);
    if (currentSummary.error || (investmentOperationType === "sell" && quantity > currentSummary.quantity + 1e-9)) {
      setNotice(currentSummary.error ?? "A venda não pode superar a quantidade disponível na carteira.");
      return;
    }
    const net = investmentOperationType === "sell" ? grossCents - feeCents : grossCents + feeCents;
    if (net > 99999999999999n) { setNotice("O valor líquido excede o limite financeiro permitido."); return; }
    const netAmount = `${net / 100n}.${String(net % 100n).padStart(2, "0")}`;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("investment_operations").insert({
        user_id: session.user.id, asset_id: asset.id, operation_type: investmentOperationType,
        operation_date: investmentDate, quantity: quantityNormalized,
        unit_price: unitPrice, gross_amount: gross, fees,
        net_amount: netAmount,
      }).select("id,asset_id,operation_type,operation_date,quantity,unit_price,gross_amount,fees").single();
      if (error) throw error;
      setInvestmentOperations((current) => [...current, data as InvestmentOperationRow]);
      setInvestmentQuantity(""); setInvestmentUnitPrice(""); setInvestmentFees("0,00");
      setNotice("Operação registrada no histórico da carteira.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function investmentSummary(assetId: string) {
    const operations: InvestmentOperation[] = investmentOperations.filter((item) => item.asset_id === assetId).map((item) => {
      const common = { date: item.operation_date, quantity: Number(item.quantity) };
      if (item.operation_type === "opening") return { type: "opening", ...common, costCents: Number(decimalToCents(item.gross_amount) + decimalToCents(item.fees)) };
      if (item.operation_type === "buy") return { type: "buy", ...common, unitPriceCents: Number(decimalToCents(item.unit_price)), feesCents: Number(decimalToCents(item.fees)) };
      return { type: "sell", ...common, unitPriceCents: Number(decimalToCents(item.unit_price)), feesCents: Number(decimalToCents(item.fees)) };
    });
    return calculateInvestmentSummary(operations);
  }

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const target = normalizeBrlAmount(goalTarget);
    const monthly = normalizeBrlAmount(goalMonthly, true);
    if (!goalName.trim() || goalName.trim().length > 100 || !target || !monthly ||
        (goalTargetMonth && !/^\\d{4}-\\d{2}$/.test(goalTargetMonth))) {
      setNotice("Confira o nome, o valor da meta, a contribuição mensal e o mês desejado.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("goals").insert({
        user_id: session.user.id, name: goalName.trim(), target_amount: target,
        monthly_contribution: monthly, target_month: goalTargetMonth ? `${goalTargetMonth}-01` : null,
      }).select("id,name,target_amount,current_amount,monthly_contribution,target_month").single();
      if (error) throw error;
      setGoals((current) => [...current, data as GoalRow]);
      setGoalName(""); setGoalTarget(""); setGoalMonthly("0,00"); setGoalTargetMonth("");
      setNotice("Meta criada. Registre contribuições para acompanhar o progresso.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function contributeToGoal(goal: GoalRow) {
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(goalContributionAmounts[goal.id] ?? "");
    if (!amount) { setNotice("Informe um valor válido para a contribuição."); return; }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.rpc("add_goal_contribution", {
        p_goal_id: goal.id, p_amount: amount, p_contribution_date: todayInBrazil(),
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || typeof result.current_amount !== "string") throw new Error("Não foi possível confirmar o saldo atualizado da meta.");
      setGoals((current) => current.map((item) => item.id === goal.id
        ? { ...item, current_amount: result.current_amount } : item));
      setGoalContributions((current) => [{ id: result.contribution_id, goal_id: goal.id, amount, contribution_date: todayInBrazil(), source: "manual", created_at: new Date().toISOString() }, ...current].slice(0, 100));
      setGoalContributionAmounts((current) => ({ ...current, [goal.id]: "" }));
      setNotice("Contribuição registrada no histórico da meta.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createRecurrence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(recurrenceAmount);
    const interval = Number(recurrenceInterval);
    const weekday = Number(recurrenceWeekday);
    const monthDay = Number(recurrenceMonthDay);
    const month = Number(recurrenceMonth);
    if (!recurrenceName.trim() || recurrenceName.trim().length > 100 || !amount || !recurrenceStart ||
        (recurrenceEnd && recurrenceEnd < recurrenceStart) ||
        (recurrenceFrequency === "interval" && (!Number.isInteger(interval) || interval < 1 || interval > 366)) ||
        (recurrenceFrequency === "weekly" && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) ||
        ((recurrenceFrequency === "monthly" || recurrenceFrequency === "yearly") && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) ||
        (recurrenceFrequency === "yearly" && (!Number.isInteger(month) || month < 1 || month > 12)) ||
        (recurrenceCardId && recurrenceKind !== "expense")) {
      setNotice("Confira nome, valor, frequência, data inicial/final e os parâmetros do calendário.");
      return;
    }
    const horizonBase = recurrenceStart > todayInBrazil() ? recurrenceStart : todayInBrazil();
    const horizon = new Date(`${horizonBase}T12:00:00.000Z`);
    horizon.setUTCFullYear(horizon.getUTCFullYear() + 10);
    const nextDate = generateOccurrences({
      id: "recurrence-preview", frequency: recurrenceFrequency, startsOn: recurrenceStart,
      endsOn: recurrenceEnd || null, intervalCount: recurrenceFrequency === "interval" ? interval : 1,
      weekday: recurrenceFrequency === "weekly" ? weekday : undefined,
      monthDay: recurrenceFrequency === "monthly" || recurrenceFrequency === "yearly" ? monthDay : undefined,
      monthOfYear: recurrenceFrequency === "yearly" ? month : undefined,
    }, todayInBrazil(), horizon.toISOString().slice(0, 10))[0];
    if (!nextDate) {
      setNotice("Esta regra não possui uma próxima ocorrência dentro do período definido.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("recurrence_rules").insert({
        user_id: session.user.id, name: recurrenceName.trim(), kind: recurrenceKind, amount,
        frequency: recurrenceFrequency, interval_count: recurrenceFrequency === "interval" ? interval : 1,
        weekday: recurrenceFrequency === "weekly" ? weekday : null,
        month_day: recurrenceFrequency === "monthly" || recurrenceFrequency === "yearly" ? monthDay : null,
        month_of_year: recurrenceFrequency === "yearly" ? month : null,
        starts_on: recurrenceStart, ends_on: recurrenceEnd || null, next_occurrence_on: nextDate,
        category_id: recurrenceCategoryId || null, account_id: recurrenceCardId ? null : recurrenceAccountId || null,
        card_id: recurrenceCardId || null, is_active: true,
      }).select("id,name,kind,amount,frequency,interval_count,weekday,month_day,month_of_year,starts_on,ends_on,next_occurrence_on,account_id,card_id,is_active").single();
      if (error) throw error;
      setRecurrences((current) => [...current, data as RecurrenceRow].sort((a,b) => a.next_occurrence_on.localeCompare(b.next_occurrence_on)));
      setRecurrenceName(""); setRecurrenceAmount(""); setRecurrenceEnd(""); setRecurrenceCategoryId("");
      setNotice("Regra de recorrência cadastrada. Nenhum lançamento foi criado automaticamente.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function toggleRecurrence(rule: RecurrenceRow) {
    if (!supabase || !session) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("recurrence_rules").update({ is_active: !rule.is_active })
        .eq("id", rule.id).eq("user_id", session.user.id)
        .select("id,name,kind,amount,frequency,interval_count,weekday,month_day,month_of_year,starts_on,ends_on,next_occurrence_on,account_id,card_id,is_active").single();
      if (error) throw error;
      setRecurrences((current) => current.map((item) => item.id === rule.id ? data as RecurrenceRow : item));
      setNotice(data.is_active ? "Recorrência reativada." : "Recorrência pausada.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function registerInvoicePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(invoicePaymentAmount);
    const card = cards.find((item) => item.id === invoicePaymentCardId);
    const account = accounts.find((item) => item.id === invoicePaymentAccountId);
    const today = todayInBrazil();
    if (!amount || !card || !account || account.account_type === "investment" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(invoiceClosingDate) ||
        !/^\\d{4}-\\d{2}-\\d{2}$/.test(invoicePaymentDate) || invoicePaymentDate > today) {
      setNotice("Selecione cartão, conta, fechamento da fatura e uma data de pagamento válida (até hoje).");
      return;
    }
    const paymentCents = Math.round(Number(amount) * 100);
    const existingPayments = invoicePayments.filter((item) => item.card_id === card.id && item.invoice_closing_date === invoiceClosingDate)
      .map((item) => ({ amountCents: Math.round(Number(item.amount) * 100), date: item.payment_date, accountId: item.account_id }));
    const invoice = calculateInvoice(card.id, card.closing_day, card.due_day, cardInvoiceEntries, invoiceClosingDate, existingPayments, today);
    if (invoice.totalCents <= 0 || paymentCents > invoice.remainingCents) {
      setNotice(invoice.totalCents <= 0
        ? "Não encontramos compras para essa fatura e data de fechamento."
        : "O pagamento informado ultrapassa o saldo restante da fatura.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("card_invoice_payments").insert({
        user_id: session.user.id, card_id: card.id, account_id: account.id,
        invoice_closing_date: invoiceClosingDate, amount, payment_date: invoicePaymentDate,
        description: `Pagamento da fatura · ${card.name}`,
      }).select("id,card_id,account_id,invoice_closing_date,amount,payment_date,description").single();
      if (error) throw error;
      setInvoicePayments((current) => [data as CardInvoicePaymentRow, ...current]);
      setInvoicePaymentAmount("");
      setNotice("Pagamento da fatura registrado. O saldo da conta e o limite disponível foram atualizados.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function deleteInvoicePayment(payment: CardInvoicePaymentRow) {
    if (!supabase || !session || !window.confirm("Excluir este pagamento de fatura? O saldo da conta e o limite do cartão serão recalculados.")) return;
    setBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("card_invoice_payments").delete()
        .eq("id", payment.id).eq("user_id", session.user.id);
      if (error) throw error;
      setInvoicePayments((current) => current.filter((item) => item.id !== payment.id));
      setNotice("Pagamento removido e saldos recalculados.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(txAmount);
    const validTransfer = txKind === "transfer" && Boolean(txTransferFromId) && Boolean(txTransferToId) && txTransferFromId !== txTransferToId;
    const selectedAccount = accounts.find((account) => account.id === txAccountId);
    const isCreditExpense = txKind === "expense" && txPaymentMethod === "credit";
    const installmentCount = isCreditExpense ? Number(txInstallmentCount) : 1;
    const validInstallments = Number.isInteger(installmentCount) && installmentCount >= 1 && installmentCount <= 48;
    const accountMatchesPayment = Boolean(selectedAccount) && selectedAccount?.account_type !== "investment" &&
      (txKind !== "expense" || (txPaymentMethod === "cash"
        ? selectedAccount?.account_type === "cash"
        : selectedAccount?.account_type !== "cash"));
    const validRegular = txKind !== "transfer" && validInstallments &&
      (isCreditExpense ? Boolean(txCardId) : accountMatchesPayment) &&
      !(txCardId && !isCreditExpense);
    if (!amount || !txDescription.trim() || (!validTransfer && !validRegular) || !txDate) {
      setNotice(txKind === "transfer"
        ? "Selecione contas de origem e destino diferentes, além de descrição, valor e data."
        : "Preencha descrição, valor, data e selecione uma conta ou cartão. Cartões são usados somente para despesas.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const selectTransaction = "id,kind,status,payment_method,amount,transaction_date,description,account_id,card_id,transfer_from_account_id,transfer_to_account_id,category_id";
      const result = txKind === "transfer"
        ? await supabase.from("transactions").insert({
            user_id: session.user.id, kind: "transfer", status: txStatus, amount,
            transaction_date: txDate, description: txDescription.trim(),
            account_id: null, card_id: null, category_id: null,
            transfer_from_account_id: txTransferFromId, transfer_to_account_id: txTransferToId,
            settled_amount: txStatus === "paid" ? amount : "0.00",
            settled_at: txStatus === "paid" ? txDate : null, source: "manual",
          }).select(selectTransaction).single()
        : await supabase.from("transactions").insert({
            user_id: session.user.id, kind: txKind, status: txStatus, amount,
            transaction_date: txDate, description: txDescription.trim(),
            account_id: isCreditExpense ? null : txAccountId, card_id: isCreditExpense ? txCardId : null, category_id: txCategoryId || null,
            payment_method: txKind === "expense" ? (isCreditExpense ? "credit" : txPaymentMethod) : null,
            installment_group_id: txCardId && installmentCount > 1 ? crypto.randomUUID() : null,
            installment_number: txCardId && installmentCount > 1 ? 1 : null,
            installment_count: txCardId && installmentCount > 1 ? installmentCount : null,
            transfer_from_account_id: null, transfer_to_account_id: null,
            settled_amount: txStatus === "paid" ? amount : "0.00",
            settled_at: txStatus === "paid" ? txDate : null, source: "manual",
          }).select(selectTransaction).single();
      const { data, error } = result;
      if (error) throw error;
      setTransactions((current) => [data as TransactionRow, ...current].slice(0, 10000));
      setTxDescription(""); setTxAmount(""); setTxCategoryId(""); setTxInstallmentCount("1"); setTxPaymentMethod("pix");
      setNotice(txStatus === "paid" ? "Lançamento realizado criado." : "Lançamento previsto criado.");
      await refreshBudgetSpend();
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function beginTransactionEdit(item: TransactionRow) {
    setEditingTransactionId(item.id);
    setEditDescription(item.description);
    setEditAmount(item.amount.replace(".", ","));
    setEditDate(item.transaction_date);
    setEditStatus(item.status === "planned" ? "planned" : "paid");
  }

  async function saveTransactionEdit(item: TransactionRow) {
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(editAmount);
    if (!amount || !editDescription.trim() || !editDate) {
      setNotice("Confira a descrição, o valor e a data do lançamento."); return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("transactions").update({
        description: editDescription.trim(), amount, transaction_date: editDate,
        status: editStatus, settled_amount: editStatus === "paid" ? amount : "0.00",
        settled_at: editStatus === "paid" ? editDate : null,
      }).eq("id", item.id).eq("user_id", session.user.id)
        .select("id,kind,status,amount,transaction_date,description,account_id,card_id,transfer_from_account_id,transfer_to_account_id,category_id").single();
      if (error) throw error;
      setTransactions((current) => current.map((row) => row.id === item.id ? data as TransactionRow : row));
      setEditingTransactionId(null);
      setNotice("Lançamento atualizado.");
      await refreshBudgetSpend();
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function openReceiptFile(transactionId: string) {
    if (!supabase || !session) return;
    setBusy(true); setNotice("");
    try {
      const receipt = receiptFiles.find((item) => item.transaction_id === transactionId);
      if (!receipt) throw new Error("Comprovante não encontrado para este lançamento.");
      const { data, error } = await supabase.storage.from("receipt-files").createSignedUrl(receipt.storage_path, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("Não foi possível abrir o comprovante.");
      window.location.assign(data.signedUrl);
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function deleteTransaction(item: TransactionRow) {
    if (!supabase || !session || !window.confirm(`Excluir o lançamento "${item.description}"?`)) return;
    setBusy(true); setNotice("");
    try {
      const receipt = receiptFiles.find((file) => file.transaction_id === item.id);
      if (receipt) {
        const { error: storageError } = await supabase.storage.from("receipt-files").remove([receipt.storage_path]);
        if (storageError) throw storageError;
      }
      const { error } = await supabase.from("transactions").delete()
        .eq("id", item.id).eq("user_id", session.user.id);
      if (error) {
        if (receipt) {
          await supabase.from("receipt_files").delete().eq("id", receipt.id).eq("user_id", session.user.id);
          setReceiptFiles((current) => current.filter((file) => file.id !== receipt.id));
          throw new Error("O comprovante foi removido, mas o lançamento permaneceu. Tente excluir novamente.");
        }
        throw error;
      }
      setTransactions((current) => current.filter((row) => row.id !== item.id));
      setReceiptFiles((current) => current.filter((file) => file.transaction_id !== item.id));
      if (editingTransactionId === item.id) setEditingTransactionId(null);
      setNotice("Lançamento e comprovante excluídos.");
      await refreshBudgetSpend();
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function patchReceiptDraft<K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) {
    setReceiptDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function askAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !assistantConsent || assistantQuestion.trim().length < 2) {
      setNotice("Leia e aceite o envio dos dados à IA antes de continuar."); return;
    }
    setBusy(true); setAssistantAnswer(""); setAssistantConsent(false); setNotice("");
    try {
      const facts = {
        "lancamentos recentes": transactions.slice(0, 20).map((item) => ({
          tipo: item.kind, situacao: item.status, valor: item.amount,
          data: item.transaction_date, descricao: item.description,
        })),
      };
      const { data, error } = await supabase.functions.invoke("assistente", {
        body: { consent: true, question: assistantQuestion.trim(), facts, history: [] },
      });
      if (error) throw error;
      setAssistantAnswer(data?.data?.answer ?? "Não foi possível obter uma resposta.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function readReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !receiptFile || !receiptConsent) {
      setNotice("Selecione um comprovante e confirme o envio à IA."); return;
    }
    const supported = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!supported.includes(receiptFile.type) || receiptFile.size > 5 * 1024 * 1024) {
      setNotice("Envie PDF, JPEG, PNG ou WEBP de até 5 MB."); return;
    }
    setBusy(true); setReceiptDraft(null); setReceiptConsent(false); setNotice("");
    try {
      const bytes = new Uint8Array(await receiptFile.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      const { data, error } = await supabase.functions.invoke("ler-comprovante", {
        body: { consent: true, file_base64: btoa(binary), mime_type: receiptFile.type },
      });
      if (error) throw error;
      const draft = data?.data?.draft as ReceiptDraft | null;
      if (draft) setReceiptDraft(draft);
      else setNotice(data?.data?.message ?? "Não foi possível extrair os dados. Faça o lançamento manualmente.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function confirmReceiptDraft() {
    if (!supabase || !session || !receiptDraft?.sufficient || !receiptDraft.amount ||
        !receiptDraft.date || !receiptDraft.kind || !receiptDraft.description || !receiptAccountId || !receiptFile) return;
    if (receiptDraft.installment_count && receiptDraft.installment_count > 1) {
      setNotice("Este comprovante indica compra parcelada. O lançamento parcelado precisa ser cadastrado manualmente nesta versão.");
      return;
    }
    if (receiptFile.size <= 0 || receiptFile.size > 5 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(receiptFile.type)) {
      setNotice("O arquivo do comprovante não é válido ou excede 5 MB.");
      return;
    }
    const amount = normalizeBrlAmount(receiptDraft.amount.replace(".", ","));
    if (!amount) { setNotice("O valor extraído precisa ser revisado."); return; }
    setBusy(true); setNotice("");
    const transactionId = crypto.randomUUID();
    let storagePath: string | null = null;
    let transactionCreated = false;
    try {
      let categoryId: string | null = null;
      if (receiptDraft.category) {
        const { data: category, error: categoryError } = await supabase.from("categories")
          .select("id").eq("user_id", session.user.id).eq("kind", receiptDraft.kind)
          .ilike("name", receiptDraft.category).maybeSingle();
        if (categoryError) throw categoryError;
        categoryId = category?.id ?? null;
      }
      let cardId: string | null = null;
      if (receiptDraft.card_last_four) {
        const { data: matchedCards, error: cardError } = await supabase.from("cards")
          .select("id").eq("user_id", session.user.id).eq("is_archived", false)
          .eq("last_four", receiptDraft.card_last_four);
        if (cardError) throw cardError;
        if (matchedCards?.length === 1) cardId = matchedCards[0].id;
      }
      const { data, error } = await supabase.from("transactions").insert({
        id: transactionId, user_id: session.user.id, kind: receiptDraft.kind, status: "paid",
        amount, transaction_date: receiptDraft.date, description: receiptDraft.description,
        category_id: categoryId, account_id: cardId ? null : receiptAccountId,
        card_id: cardId, payment_method: receiptDraft.payment_method,
        settled_amount: amount, settled_at: receiptDraft.date, source: "receipt",
      }).select("id,kind,status,amount,transaction_date,description,account_id,card_id,transfer_from_account_id,transfer_to_account_id,category_id").single();
      if (error || !data) throw error ?? new Error("Não foi possível criar o lançamento.");
      transactionCreated = true;

      const extension = receiptFile.type === "image/jpeg" ? "jpg" :
        receiptFile.type === "image/png" ? "png" :
        receiptFile.type === "image/webp" ? "webp" : "pdf";
      storagePath = `${session.user.id}/${transactionId}/${crypto.randomUUID()}.${extension}`;
      const bytes = await receiptFile.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const { error: uploadError } = await supabase.storage.from("receipt-files").upload(storagePath, receiptFile, {
        contentType: receiptFile.type, cacheControl: "0", upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: receiptRow, error: receiptError } = await supabase.from("receipt_files").insert({
        user_id: session.user.id, transaction_id: transactionId, storage_path: storagePath,
        mime_type: receiptFile.type, byte_size: receiptFile.size, sha256,
      }).select("id,transaction_id,storage_path,mime_type,byte_size,created_at").single();
      if (receiptError || !receiptRow) throw receiptError ?? new Error("Não foi possível vincular o comprovante ao lançamento.");

      await refreshBudgetSpend();
      setReceiptFiles((current) => [receiptRow as ReceiptFileRow, ...current].slice(0, 100));
      setTransactions((current) => [data as TransactionRow, ...current].slice(0, 10000));
      setReceiptDraft(null); setReceiptFile(null); setReceiptConsent(false);
      setNotice("Lançamento confirmado e comprovante armazenado com acesso privado.");
    } catch (error) {
      let cleanupFailed = false;
      if (storagePath) {
        const { error: removeError } = await supabase.storage.from("receipt-files").remove([storagePath]);
        if (removeError) cleanupFailed = true;
      }
      if (transactionCreated) {
        const { error: deleteError } = await supabase.from("transactions").delete()
          .eq("id", transactionId).eq("user_id", session.user.id);
        if (deleteError) cleanupFailed = true;
      }
      setNotice(cleanupFailed
        ? `A gravação do comprovante falhou e a limpeza automática precisa de revisão: ${errorMessage(error)}`
        : `Lançamento não confirmado; os dados parciais foram revertidos. ${errorMessage(error)}`);
    } finally { setBusy(false); }
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    const value = Number(threshold.replace(",", "."));
    try {
      const { data, error } = await supabase.functions.invoke("radar-alertas", {
        body: { action: "criar", asset_class: assetClass, symbol: symbol.trim().toUpperCase(),
          condition_type: condition, threshold: value },
      });
      if (error) throw error;
      setAlerts((current) => [data.data as RadarAlert, ...current]);
      setSymbol(""); setThreshold("");
      setNotice("Alerta criado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function changeAlert(alert: RadarAlert, action: "ativar" | "desativar" | "excluir") {
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.functions.invoke("radar-alertas", {
        body: { action, id: alert.id },
      });
      if (error) throw error;
      if (action === "excluir") setAlerts((current) => current.filter((item) => item.id !== alert.id));
      else setAlerts((current) => current.map((item) => item.id === alert.id
        ? { ...item, ...data.data } : item));
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return (
    <main className="app-shell" data-theme={theme} data-balances-hidden={balancesHidden ? "true" : "false"}>
      <div className="app-frame">
        <header className="topbar topbar-minimal">
          <a className="brand" href="/" onClick={(event) => event.preventDefault()}>
            <span className="brand-mark" aria-hidden="true"><ChartNoAxesColumn size={22} strokeWidth={2.8} /></span>
            <span>Grana<span className="brand-accent">Viva</span></span>
          </a>
          {signedIn && <button className="notification-button" type="button" aria-label={`Radar e notificações: ${alerts.length} alertas`} onClick={() => setActiveTab("patrimonio")}><Bell size={21} strokeWidth={2} />{enabledAlerts > 0 && <span className="notification-dot" />}</button>}
        </header>
        {signedIn && quickEntryOpen && <div className="quick-entry-backdrop" role="presentation" onClick={() => setQuickEntryOpen(false)}>
          <section className="quick-entry-modal" role="dialog" aria-modal="true" aria-labelledby="quick-entry-title" onClick={(event) => event.stopPropagation()}>
            <div className="quick-entry-modal-heading"><div><strong id="quick-entry-title">Novo lançamento</strong><p>Escolha o que deseja registrar</p></div><button type="button" className="quiet-button" aria-label="Fechar" onClick={() => setQuickEntryOpen(false)}>✕</button></div>
            <div className="quick-entry-options">
              <button type="button" onClick={() => { setTxKind("expense"); setTxPaymentMethod("pix"); setTxAccountId(""); setTxCardId(""); setActiveTab("gastos"); setQuickEntryOpen(false); }}>Despesa</button>
              <button type="button" onClick={() => { setTxKind("income"); setTxPaymentMethod("pix"); setTxAccountId(""); setTxCardId(""); setActiveTab("gastos"); setQuickEntryOpen(false); }}>Receita</button>
              <button type="button" onClick={() => { setTxKind("transfer"); setTxPaymentMethod("pix"); setTxAccountId(""); setTxCardId(""); setActiveTab("gastos"); setQuickEntryOpen(false); }}>Transferência / aporte / resgate</button>
              <button type="button" onClick={() => { setActiveTab("planejamento"); setQuickEntryOpen(false); }}>Emprestar</button>
              <button type="button" onClick={() => { setActiveTab("planejamento"); setQuickEntryOpen(false); }}>Hora extra</button>
            </div>
          </section>
        </div>}
        {!signedIn ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-copy">
              <span className="eyebrow"><span className="live-dot" /> CONTROLE FINANCEIRO PESSOAL</span>
              <h1 id="welcome-title">Sua vida financeira, <span>em equilíbrio.</span></h1>
              <p>Um espaço claro e seguro para acompanhar seu dinheiro, organizar decisões e construir seu futuro — gratuito para todos.</p>
              <div className="foundation-state">
                <span className="state-icon" aria-hidden="true">✓</span>
                <span><strong>Privacidade em primeiro lugar</strong><small>Seus dados são isolados por conta e protegidos no servidor.</small></span>
              </div>
            </div>
            <section className="auth-card" aria-labelledby="auth-title">
              <span className="principles-label">SUA CONTA GRANAVIVA</span>
              <h2 id="auth-title">{authMode === "entrar" ? "Bem-vindo de volta" : "Criar sua conta"}</h2>
              {!supabase ? (
                <p className="muted-copy">O ambiente ainda não está conectado ao Supabase. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para habilitar o acesso.</p>
              ) : !authReady ? <p className="muted-copy">Verificando sua sessão…</p> : (
                <form className="stack-form" onSubmit={(event) => void handleAuth(event)}>
                  {authMode === "criar" && <label>Nome de exibição<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="name" required /></label>}
                  <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                  <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete={authMode === "entrar" ? "current-password" : "new-password"} required /></label>
                  <button className="primary-button" type="submit" disabled={busy}>{busy ? "Aguarde…" : authMode === "entrar" ? "Entrar" : "Criar conta"}</button>
                </form>
              )}
              <button className="text-button" type="button" onClick={() => { setAuthMode(authMode === "entrar" ? "criar" : "entrar"); setNotice(""); }}>
                {authMode === "entrar" ? "Ainda não tem conta? Criar agora" : "Já tem uma conta? Entrar"}
              </button>
              {notice && <p className="notice" role="status">{notice}</p>}
            </section>
          </section>
        ) : (
          <section className="dashboard" aria-labelledby="dashboard-title">
            {activeTab === "inicio" && <div className="dashboard-heading dashboard-heading-compact" id="inicio"><h1 id="dashboard-title" className="sr-only">Visão geral</h1></div>}
            {activeTab === "inicio" && <section className="overview-grid" aria-label="Resumo financeiro">
              <article className="overview-balance">
                <div className="overview-label"><span>Saldo disponível</span><button className="balance-visibility-toggle icon-visibility" type="button" aria-label={balancesHidden ? "Mostrar saldos" : "Ocultar saldos"} aria-pressed={balancesHidden} onClick={() => setBalancesHidden((hidden) => !hidden)}>{balancesHidden ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
                <strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(accounts.filter((account) => account.account_type !== "investment").reduce((sum, account) => sum + (accountBalances[account.id] ?? 0), 0))}</strong>
                <small>{accounts.filter((account) => account.account_type !== "investment").length} contas bancárias e dinheiro físico</small>
                {(() => {
                  const reference = new Date(currentBudgetDate + "T12:00:00");
                  const points = Array.from({ length: 6 }, (_, index) => {
                    const date = new Date(reference.getFullYear(), reference.getMonth() - (5-index), 1, 12);
                    const key = String(date.getFullYear()) + "-" + String(date.getMonth()+1).padStart(2,"0");
                    const rows = transactions.filter((item) => item.status === "paid" && item.transaction_date.startsWith(key));
                    return rows.filter((item) => item.kind === "income").reduce((sum,item)=>sum+Number(item.amount),0) - rows.filter((item) => item.kind === "expense").reduce((sum,item)=>sum+Number(item.amount),0);
                  });
                  const max = Math.max(1,...points.map((value)=>Math.abs(value)));
                  const coords = points.map((value,index)=>({x:8+index*56,y:46-(value/max*27)}));
                  const path = coords.map((point,index)=>(index===0?"M":"L")+point.x+" "+point.y).join(" ");
                  const area = path+" L "+coords[coords.length-1].x+" 54 L "+coords[0].x+" 54 Z";
                  return <svg className="overview-balance-chart" viewBox="0 0 296 58" preserveAspectRatio="none" role="img" aria-label="Evolução do fluxo líquido nos últimos seis meses"><defs><linearGradient id="balance-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#22C55E" stopOpacity=".34"/><stop offset="100%" stopColor="#22C55E" stopOpacity="0"/></linearGradient></defs><path d={area} fill="url(#balance-area-fill)"/><path d={path} fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
                })()}
              </article>
              
              <article className="overview-stat"><span>Patrimônio investido</span>{(() => {
                const totals = investmentAssets.reduce((sum, asset) => {
                  const summary = investmentSummary(asset.id);
                  const currentPrice = asset.current_price == null ? null : Number(asset.current_price);
                  const amount = summary.quantity > 0 ? (currentPrice != null && currentPrice > 0 ? currentPrice * summary.quantity : Number(summary.costBasisCents) / 100) : 0;
                  if (asset.currency === "USD") sum.usd += amount; else sum.brl += amount;
                  return sum;
                }, { brl: 0, usd: 0 });
                const brlTotal = financialSummary?.investment_reference_brl == null ? totals.brl : Number(financialSummary.investment_reference_brl);
                const usdTotal = financialSummary?.investment_reference_usd == null ? totals.usd : Number(financialSummary.investment_reference_usd);
                return <><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(brlTotal)}</strong><small>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usdTotal)} · separado da liquidez</small></>;
              })()}</article>
              <article className="overview-month-summary">
                <div className="overview-recent-heading"><strong>Resumo do mês</strong><button type="button" onClick={() => setActiveTab("relatorios")}>Ver detalhes <span aria-hidden="true">›</span></button></div>
                {(() => {
                  const monthRows = transactions.filter((item) => item.status === "paid" && item.transaction_date.startsWith(currentBudgetDate.slice(0, 7)));
                  const income = monthRows.filter((item) => item.kind === "income").reduce((sum, item) => sum + Number(item.amount), 0);
                  const expense = monthRows.filter((item) => item.kind === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
                  const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
                  return <div className="overview-month-columns"><div><span>Receitas</span><strong className="amount-income">{money(income)}</strong></div><div><span>Despesas</span><strong className="amount-expense">{money(expense)}</strong></div><div><span>Saldo</span><strong>{money(income-expense)}</strong></div></div>;
                })()}
              </article>
              <div className="quick-actions-grid" aria-label="Ações rápidas">
                <button type="button" onClick={() => { setTxKind("expense"); setTxPaymentMethod("pix"); setTxAccountId(""); setTxCardId(""); setQuickEntryOpen(true); }}><CircleMinus /><span>Adicionar<br/>despesa</span></button>
                <button type="button" onClick={() => { setTxKind("income"); setTxPaymentMethod("pix"); setTxAccountId(""); setTxCardId(""); setQuickEntryOpen(true); }}><CirclePlus /><span>Adicionar<br/>receita</span></button>
                <button type="button" onClick={() => setActiveTab("planejamento")}><Target /><span>Metas</span></button>
                <button type="button" onClick={() => setActiveTab("relatorios")}><ChartNoAxesColumn /><span>Relatórios</span></button>
              </div>
              <article className="overview-recent">
                <div className="overview-recent-heading"><strong>Últimos lançamentos</strong><button type="button" onClick={() => setActiveTab("gastos")}>Ver gastos <span aria-hidden="true">›</span></button></div>
                {transactions.length === 0 ? <p className="empty-state">Seus lançamentos aparecerão aqui.</p> : <ul className="recent-list">{transactions.slice(0, 4).map((item) => <li key={item.id}><span className={item.kind === "income" ? "recent-icon income" : "recent-icon"}>{item.kind === "income" ? "↗" : "↘"}</span><span className="recent-description"><strong>{item.description}</strong><small>{new Date(item.transaction_date + "T12:00:00").toLocaleDateString("pt-BR")}</small></span><strong className={item.kind === "income" ? "amount-income" : "amount-expense"}>{item.kind === "income" ? "+" : "−"}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.amount))}</strong></li>)}</ul>}
              </article>
              <article className="overview-flow">
                <div className="overview-recent-heading"><strong>Fluxo dos últimos 6 meses</strong><span>Valores realizados</span></div>
                {(() => {
                  const reference = new Date(currentBudgetDate + "T12:00:00");
                  const months = Array.from({ length: 6 }, (_, index) => {
                    const date = new Date(reference.getFullYear(), reference.getMonth() - (5 - index), 1, 12);
                    const key = String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0");
                    const rows = transactions.filter((item) => item.status === "paid" && item.transaction_date.startsWith(key));
                    return { key, label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""), income: rows.filter((item) => item.kind === "income").reduce((sum, item) => sum + Number(item.amount), 0), expense: rows.filter((item) => item.kind === "expense").reduce((sum, item) => sum + Number(item.amount), 0) };
                  });
                  const max = Math.max(1, ...months.flatMap((month) => [month.income, month.expense]));
                  return <div className="cashflow-chart">{months.map((month) => <div className="cashflow-month" key={month.key}><div className="cashflow-bars"><span className="cashflow-income" style={{ height: Math.max(3, month.income / max * 100) + "%" }} title={"Receitas: " + month.income.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /><span className="cashflow-expense" style={{ height: Math.max(3, month.expense / max * 100) + "%" }} title={"Despesas: " + month.expense.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /></div><small>{month.label}</small></div>)}</div>;
                })()}
                <div className="cashflow-legend"><span><i className="cashflow-income" /> Receitas</span><span><i className="cashflow-expense" /> Despesas</span></div>
                <p className="helper-text">Considera apenas lançamentos realizados disponíveis no histórico carregado. Meses sem registros aparecem sem movimento.</p>
              </article>
              <button className="overview-action" type="button" onClick={() => setActiveTab("gastos")}><span aria-hidden="true">＋</span> Organizar contas e cartões</button>
            </section>}
            <section className="panel privacy-panel" hidden={activeTab !== "conta"} id="conta" aria-labelledby="privacy-title">
              <div className="panel-heading"><div><span className="principles-label">PRIVACIDADE E CONTROLE</span><h2 id="privacy-title">Seus dados e sua conta</h2><p>Exporte uma cópia dos seus dados ou solicite a exclusão permanente da conta e dos comprovantes privados.</p></div></div>
              <div className="account-profile-card">
                <span className="account-avatar">{(profile?.display_name || session?.user.email || "GV").split(/\s+/).map((part) => part[0]).join("").slice(0,2).toUpperCase()}</span>
                <span><strong>{profile?.display_name || "Minha conta"}</strong><small>{session?.user.email}</small></span>
              </div>
              <div className="account-menu-list">
                <button type="button" onClick={() => setActiveTab("gastos")}><span className="account-menu-icon green">⌁</span><span><strong>Conexões</strong><small>WhatsApp e notificações, quando configurados</small></span><span aria-hidden="true">›</span></button>
                <button type="button" onClick={() => void toggleTheme()}><span className="account-menu-icon purple">◐</span><span><strong>Personalização</strong><small>Tema e aparência</small></span><span aria-hidden="true">›</span></button>
                <button type="button" onClick={() => setActiveTab("planejamento")}><span className="account-menu-icon blue">◎</span><span><strong>Metas e planejamento</strong><small>Objetivos e valores a receber</small></span><span aria-hidden="true">›</span></button>
                <button type="button" onClick={() => setActiveTab("relatorios")}><span className="account-menu-icon green">▥</span><span><strong>Relatórios</strong><small>Acompanhamento financeiro</small></span><span aria-hidden="true">›</span></button>
              </div>
              <nav className="section-jump" aria-label="Atalhos da área da conta"><a href="#conta">Dados e privacidade</a><a href="#conta-relatorios">Relatórios</a><a href="#conta-assistente">Assistente</a><a href="#conta-comprovante">Leitor de comprovantes</a><a href="#conta-proximos-passos">Próximos recursos</a></nav>
              <details className="account-data-details">
                <summary>Dados, backup e privacidade <span aria-hidden="true">⌄</span></summary>
              <div className="privacy-actions">
                <button className="primary-button" type="button" onClick={() => void exportPersonalData()} disabled={busy}>Exportar meus dados (JSON)</button>
                <label>Para excluir, digite EXCLUIR_CONTA
                  <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} autoComplete="off" spellCheck={false} placeholder="EXCLUIR_CONTA" />
                </label>
                <button className="quiet-button danger-button" type="button" onClick={() => void deletePersonalAccount()} disabled={busy || deleteConfirmText !== "EXCLUIR_CONTA"}>Excluir minha conta permanentemente</button>
              </div>
              <p className="helper-text">A exportação inclui metadados dos comprovantes; os arquivos podem ser abertos individualmente no histórico. A exclusão exige autenticação recente (últimos 15 minutos), remove comprovantes do Storage e apaga os dados vinculados à conta. Essa ação não pode ser desfeita.</p>
              </details>
              <button className="account-signout-button" type="button" onClick={() => void handleSignOut()} disabled={busy}>Sair da conta</button>
            </section>
            <section className="panel" id="patrimonio" hidden={activeTab !== "patrimonio"} aria-labelledby="radar-title">
              <div className="panel-heading"><div><span className="principles-label">ACOMPANHAMENTO DE ATIVOS</span><h2 id="radar-title">Patrimônio e investimentos</h2><p>Acompanhe sua carteira, a distribuição dos ativos, os proventos e os alertas de preço em um só lugar.</p></div></div>
              {signedIn && supabase && session && <IncomeGoalsPanel
                client={supabase}
                userId={session.user.id}
                assets={investmentAssets}
                operations={investmentOperations}
                events={incomeEvents}
                today={todayInBrazil()}
              />}
              <nav className="section-jump" aria-label="Atalhos do patrimônio">
                <a href="#metas-rendimentos">Metas de renda</a><a href="#patrimonio-radar">Radar</a><a href="#patrimonio-investimentos">Carteira</a><a href="#patrimonio-proventos">Proventos</a>
              </nav>
              <section className="subpanel" id="patrimonio-investimentos" aria-labelledby="investments-title">
                <div className="transaction-heading"><strong id="investments-title">Carteira de investimentos</strong><span>{investmentAssets.length} ativos</span></div>
                {investmentAssets.length > 0 && <div className="investment-allocation" aria-label="Distribuição da carteira">
                  <div className="transaction-heading"><strong>Alocação da carteira</strong><span>Por ativo e classe</span></div>
                  {(() => {
                    const baseRows = investmentAssets.map((asset) => {
                      const summary = investmentSummary(asset.id);
                      const manualValue = asset.current_price != null ? Math.max(0, Number(asset.current_price) * summary.quantity) : 0;
                      return { asset, amount: summary.quantity > 0 ? (manualValue > 0 ? manualValue : summary.costBasisCents / 100) : 0, estimated: asset.current_price == null };
                    }).filter((item) => Number.isFinite(item.amount) && item.amount > 0);
                    const colors = ["#36e38b","#64a6ff","#c28cff","#f5bd5c","#ff8c8c","#55d6c2","#a6b7c7","#d6dc72"];
                    const renderDonut = (title: string, rows: Array<{key:string;label:string;amount:number;hint?:string}>, currency: "BRL"|"USD", id: string) => {
                      const total = rows.reduce((sum,item)=>sum+item.amount,0);
                      if (!total) return null;
                      let cursor = 0;
                      const colorByKey = new Map(rows.map((item,index)=>[item.key,colors[index%colors.length]]));
                      const gradient = rows.map((item)=>{const from=cursor;cursor+=item.amount/total*100;return `${colorByKey.get(item.key)} ${from}% ${cursor}%`;}).join(", ");
                      return <div className="allocation-group" key={id}><strong>{title} · {currency}</strong><div className="allocation-chart-row"><div className="allocation-donut" role="img" aria-label={`Gráfico ${title}, total ${new Intl.NumberFormat("pt-BR",{style:"currency",currency}).format(total)}`} style={{background:`conic-gradient(${gradient})`}}><span>{new Intl.NumberFormat("pt-BR",{style:"currency",currency,notation:"compact",maximumFractionDigits:1}).format(total)}</span></div><ul className="allocation-legend">{[...rows].sort((a,b)=>b.amount-a.amount).map((item)=><li key={item.key}><span className="allocation-dot" style={{background:colorByKey.get(item.key)}}/><span><strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}</span><b>{(item.amount/total*100).toLocaleString("pt-BR",{maximumFractionDigits:1})}%</b></li>)}</ul></div></div>;
                    };
                    const currencies = (["BRL","USD"] as const).map((currency) => {
                      const rows = baseRows.filter((item)=>item.asset.currency===currency);
                      const byAsset = rows.map((item)=>({key:item.asset.id,label:item.asset.symbol,amount:item.amount,hint:item.estimated?"Custo investido · sem cotação":"Preço de referência manual"}));
                      const byClassMap = new Map<string,number>();
                      rows.forEach((item)=>byClassMap.set(item.asset.asset_class,(byClassMap.get(item.asset.asset_class)??0)+item.amount));
                      const classNames: Record<string,string> = {stock:"Ações",fii:"Fundos imobiliários",etf:"ETFs",bdr:"BDRs",fixed_income:"Renda fixa",crypto:"Cripto"};
                      const byClass = [...byClassMap.entries()].map(([key,amount])=>({key,label:classNames[key]??key,amount}));
                      return <div className="allocation-currency" key={currency}>{renderDonut("Por ativo",byAsset,currency,currency+"-asset")}{renderDonut("Por classe",byClass,currency,currency+"-class")}</div>;
                    });
                    return baseRows.length > 0 ? <>{currencies}</> : <p className="empty-state">Registre operações para visualizar a distribuição da carteira.</p>;
                  })()}
                  <p className="helper-text">A distribuição usa preço de referência manual quando disponível; nos demais ativos, usa o custo investido. Valores em BRL e USD são separados para não misturar moedas. Não representa cotação de mercado nem rentabilidade atual.</p>
                </div>}
                <details className="management-drawer"><summary>＋ Adicionar ativo à carteira</summary><form className="finance-form" onSubmit={(event) => void createInvestmentAsset(event)}>
                  <label>Ticker ou nome<input value={investmentSymbol} onChange={(event) => { const raw = event.target.value; const query = raw.trim(); const value = query.toUpperCase(); const matchEntry = Object.entries(INVESTMENT_CATALOG).find(([ticker]) => ticker === value); setInvestmentSymbol(matchEntry ? matchEntry[0] : raw); if (matchEntry) { const match = matchEntry[1]; setInvestmentName(match.name); setInvestmentClass(match.assetClass); setInvestmentCurrency("BRL"); } }} maxLength={120} autoComplete="off" placeholder="Digite PETR4, Petrobras, MXRF11..." required /></label>{investmentSymbol.trim().length >= 2 && !Object.keys(INVESTMENT_CATALOG).includes(investmentSymbol.trim().toUpperCase()) && <ul className="investment-suggestions" aria-label="Sugestões de ativos">{Object.entries(INVESTMENT_CATALOG).filter(([ticker,item]) => { const query = investmentSymbol.trim().toLocaleLowerCase("pt-BR"); return ticker.toLocaleLowerCase("pt-BR").includes(query) || item.name.toLocaleLowerCase("pt-BR").includes(query); }).slice(0,6).map(([ticker,item]) => <li key={ticker}><button type="button" onClick={() => { setInvestmentSymbol(ticker); setInvestmentName(item.name); setInvestmentClass(item.assetClass); setInvestmentCurrency("BRL"); }}>{item.name}<small>{ticker}</small></button></li>)}</ul>}
                  <label>Nome do ativo<input value={investmentName} onChange={(event) => setInvestmentName(event.target.value)} maxLength={120} placeholder="Nome ou descrição" required /></label>
                  <label>Classe<select value={investmentClass} onChange={(event) => setInvestmentClass(event.target.value as InvestmentAssetRow["asset_class"])}><option value="stock">Ação</option><option value="fii">FII</option><option value="etf">ETF</option><option value="bdr">BDR</option><option value="fixed_income">Renda fixa</option><option value="crypto">Cripto</option></select></label>
                  <label>Moeda<select value={investmentCurrency} onChange={(event) => setInvestmentCurrency(event.target.value as "BRL" | "USD")}><option value="BRL">BRL</option><option value="USD">USD</option></select></label>
                  {investmentClass === "fixed_income" && <>
                    <label>Produto<select value={fixedIncomeProduct} onChange={(event) => setFixedIncomeProduct(event.target.value)}><option>CDB</option><option>LCI</option><option>LCA</option><option>Tesouro Selic</option><option>Tesouro IPCA+</option><option>Tesouro Prefixado</option><option>LC</option><option>CRI</option><option>CRA</option><option>Poupança</option></select></label>
                    <label>Instituição emissora<input value={fixedIncomeIssuer} onChange={(event) => setFixedIncomeIssuer(event.target.value)} maxLength={100} placeholder="Ex.: Banco emissor"/></label>
                    <label>Indexador<select value={fixedIncomeIndexer} onChange={(event) => setFixedIncomeIndexer(event.target.value as typeof fixedIncomeIndexer)}><option value="CDI">CDI</option><option value="IPCA">IPCA</option><option value="SELIC">Selic</option><option value="PREFIXADO">Prefixado</option></select></label>
                    <label>Taxa anual (%)<input inputMode="decimal" value={fixedIncomeRate} onChange={(event) => setFixedIncomeRate(event.target.value)} placeholder="Ex.: 100 ou 12,5" required/></label>
                    <label>Início da aplicação<input type="date" value={fixedIncomeStart} onChange={(event) => setFixedIncomeStart(event.target.value)} required/></label>
                    <label>Vencimento<input type="date" min={fixedIncomeStart} value={fixedIncomeMaturity} onChange={(event) => setFixedIncomeMaturity(event.target.value)} required/></label>
                    <label>Próxima data de rendimento<input type="date" min={fixedIncomeStart} max={fixedIncomeMaturity || undefined} value={fixedIncomeNextYieldDate} onChange={(event) => setFixedIncomeNextYieldDate(event.target.value)} required/></label>
                    <label>Periodicidade do rendimento<select value={fixedIncomeFrequency} onChange={(event) => setFixedIncomeFrequency(event.target.value as typeof fixedIncomeFrequency)}><option value="daily">Diário (dias úteis)</option><option value="monthly">Mensal</option><option value="semiannual">Semestral</option><option value="at_maturity">No vencimento</option></select></label>
                  </>}
                  <button className="primary-button" type="submit" disabled={busy}>Adicionar ativo</button>
                </form></details>
                {investmentAssets.length > 0 && <details className="management-drawer"><summary>＋ Registrar operação</summary><form className="finance-form" onSubmit={(event) => void createInvestmentOperation(event)}>
                  <label>Ativo<select value={investmentAssetId} onChange={(event) => { const id = event.target.value; setInvestmentAssetId(id); const selected = investmentAssets.find((asset) => asset.id === id); if (selected?.current_price != null) setInvestmentUnitPrice(String(selected.current_price).replace(".", ",")); }} required>{investmentAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}</select></label>
                  <label>Operação<select value={investmentOperationType} onChange={(event) => setInvestmentOperationType(event.target.value as "opening" | "buy" | "sell")}><option value="buy">Compra</option><option value="sell">Venda</option><option value="opening">Posição inicial</option></select></label>
                  <label>Quantidade<input inputMode="decimal" value={investmentQuantity} onChange={(event) => setInvestmentQuantity(event.target.value)} placeholder="Ex.: 10" required /></label>
                  <label>Preço unitário ({investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL"})<input inputMode="decimal" value={investmentUnitPrice} onChange={(event) => setInvestmentUnitPrice(event.target.value)} placeholder="Informe o preço de referência" required /></label>
                  <label>Taxas ({investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL"})<input inputMode="decimal" value={investmentFees} onChange={(event) => setInvestmentFees(event.target.value)} required /></label>
                  <label>Data<input type="date" value={investmentDate} onChange={(event) => setInvestmentDate(event.target.value)} required /></label>
                  <p className="investment-total-preview" aria-live="polite">Total estimado da operação: <strong>{(() => { const q = Number(investmentQuantity.trim().replace(",", ".")); const p = Number(investmentUnitPrice.trim().replace(",", ".")); const f = Number(investmentFees.trim().replace(",", ".")); const total = q * p + (investmentOperationType === "sell" ? -f : f); return Number.isFinite(total) && q > 0 && p > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL" }).format(total) : "—"; })()}</strong></p>\n                  <button className="primary-button" type="submit" disabled={busy}>Registrar operação</button>
                </form></details>}
                {investmentAssets.length === 0 ? <p className="empty-state">Adicione seus ativos e registre posições iniciais, compras e vendas.</p> : <ul className="account-list">{investmentAssets.map((asset) => {
                  const summary = investmentSummary(asset.id);
                  const receivedCents = incomeEvents.filter((item) => item.asset_id === asset.id && item.status === "received")
                    .reduce((total, item) => total + decimalToCents(item.received_amount), 0n);
                  return <li key={asset.id}><strong>{asset.symbol} · {asset.name}</strong><span>{asset.asset_class} · {asset.currency}</span><small>Quantidade: {summary.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} · Custo: {formatInvestmentCents(BigInt(summary.costBasisCents), asset.currency)} · Custo médio: {formatInvestmentCents(BigInt(summary.averageCostCents), asset.currency)}</small>{asset.asset_class === "fixed_income" && (asset.metadata?.fixed_income as Record<string, unknown> | undefined) && <small>{String((asset.metadata?.fixed_income as Record<string, unknown>).product ?? asset.name)} · {String((asset.metadata?.fixed_income as Record<string, unknown>).indexer ?? "")} · {String((asset.metadata?.fixed_income as Record<string, unknown>).annual_rate_percent ?? "")}% a.a. · Próximo rendimento: {String((asset.metadata?.fixed_income as Record<string, unknown>).next_yield_date ?? "não informado")} · Vencimento: {String((asset.metadata?.fixed_income as Record<string, unknown>).maturity_date ?? "não informado")} · Periodicidade: {{daily:"diária (dias úteis)",monthly:"mensal",semiannual:"semestral",at_maturity:"no vencimento"}[String((asset.metadata?.fixed_income as Record<string, unknown>).yield_frequency ?? "")] ?? "não informado"}</small>}<small>Resultado realizado: {formatInvestmentCents(BigInt(summary.realizedProfitCents), asset.currency)}{summary.error ? ` · ${summary.error}` : ""}</small><small>Proventos recebidos: {formatInvestmentCents(receivedCents, asset.currency)}</small>{asset.current_price != null && asset.price_as_of ? <small>Preço de referência: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: asset.currency, minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(asset.current_price))} · Fonte: {asset.price_source === "brapi.dev" ? "brapi.dev" : asset.price_source === "manual" ? "informado manualmente" : "origem não identificada"}{asset.price_source === "brapi.dev" ? " · atraso de origem aproximado de 30 min" : " · não é cotação automática"}{asset.price_source === "brapi.dev" && Date.now() - Date.parse(asset.price_as_of) > 45 * 60_000 ? " · cotação possivelmente desatualizada" : ""} · registrado em {new Date(asset.price_as_of).toLocaleString("pt-BR")}</small> : <small>Sem preço de referência cadastrado.</small>}
                    <form className="finance-form" onSubmit={(event) => void updateManualInvestmentPrice(event, asset)}>
                      <label>Preço de referência manual ({asset.currency})<input inputMode="decimal" value={manualPriceInputs[asset.id] ?? ""} onChange={(event) => setManualPriceInputs((current) => ({ ...current, [asset.id]: event.target.value }))} placeholder="Ex.: 32,45" disabled={busy} /></label>
                      <button className="quiet-button" type="submit" disabled={busy || !(manualPriceInputs[asset.id] ?? "").trim()}>Salvar preço</button>
                    </form></li>;
                })}</ul>}
                <p className="helper-text">Preços informados manualmente são apenas referências e não alteram operações, saldos, custo médio ou resultado realizado, nem alimentam o Radar. Cotações automáticas da B3 permanecem desativadas até existir licença adequada. Cripto e renda fixa não têm feed automático.</p>
              </section>

              <div className="transaction-heading"><strong>Radar de preços</strong><span>{alerts.length} alertas cadastrados</span></div>
              <details className="management-drawer"><summary>＋ Criar alerta de preço</summary><form className="radar-form" id="patrimonio-radar" onSubmit={(event) => void createAlert(event)}>
                <label>Classe<select value={assetClass} onChange={(event) => setAssetClass(event.target.value as RadarAlert["asset_class"])}><option value="stock">Ação</option><option value="fii">FII</option><option value="etf">ETF</option><option value="bdr">BDR</option><option value="crypto">Cripto</option></select></label>
                <label>Ativo<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Ex.: PETR4" maxLength={32} required /></label>
                <label>Condição<select value={condition} onChange={(event) => setCondition(event.target.value as RadarAlert["condition_type"])}><option value="above">Preço acima de</option><option value="below">Preço abaixo de</option><option value="daily_drop">Queda no dia (%)</option></select></label>
                <label>{condition === "daily_drop" ? "Queda (%)" : "Valor (R$)"}<input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="0,00" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Criar alerta</button>
              </form></details>
              {alerts.length === 0 ? <p className="empty-state">Você ainda não tem alertas cadastrados.</p> : (
                <ul className="alert-list">
                  {alerts.map((alert) => <li key={alert.id}>
                    <div><strong>{alert.symbol}</strong><span>{alert.asset_class.toUpperCase()} · {alert.condition_type === "above" ? "Acima de" : alert.condition_type === "below" ? "Abaixo de" : "Queda diária"} {alert.threshold}{alert.condition_type === "daily_drop" ? "%" : ""}</span><small>Geração {alert.generation} · {alert.is_enabled ? "Ativo" : "Pausado"}</small></div>
                    <div className="alert-actions">
                      <button className="quiet-button" type="button" disabled={busy} onClick={() => void changeAlert(alert, alert.is_enabled ? "desativar" : "ativar")}>{alert.is_enabled ? "Pausar" : "Reativar"}</button>
                      <button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void changeAlert(alert, "excluir")}>Excluir</button>
                    </div>
                  </li>)}
                </ul>
              )}
              <div className="radar-fire-history">
                <div className="transaction-heading"><strong>Últimos disparos</strong><span>{radarFires.length} registrados</span></div>
                {radarFires.length === 0 ? <p className="empty-state">Nenhum alerta foi disparado ainda. Os eventos serão registrados quando houver cotações recentes e uma condição for atingida.</p> : <ul className="account-list">{radarFires.slice(0, 20).map((fire) => {
                  const alertId = fire.alert_key.split(":")[0];
                  const alert = alerts.find((item) => item.id === alertId);
                  return <li key={fire.alert_key}><strong>{alert?.symbol ?? "Ativo"} · {alert?.condition_type === "daily_drop" ? "Queda diária" : alert?.condition_type === "above" ? "Preço acima" : "Preço abaixo"}</strong><span>Preço observado: {Number(fire.observed_price).toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</span><small>Fonte: {fire.source ?? "não informada"} · Cotação de {fire.quote_observed_at ? new Date(fire.quote_observed_at).toLocaleString("pt-BR") : "horário indisponível"} · Alerta registrado {new Date(fire.fired_at).toLocaleString("pt-BR")}</small></li>;
                })}</ul>}
              </div>
            
              <section className="subpanel" id="patrimonio-proventos" aria-labelledby="income-events-title">
                <div className="transaction-heading"><strong id="income-events-title">Dividendos e proventos</strong><span>{incomeEvents.filter((item) => item.status === "received").length} recebidos</span></div>
                {investmentAssets.length === 0 ? <p className="empty-state">Cadastre um ativo para registrar dividendos, JCP e outros proventos.</p> : <>
                  <details className="management-drawer"><summary>＋ Registrar provento</summary><form className="finance-form" onSubmit={(event) => void createIncomeEvent(event)}>
                    <label>Ativo<select value={incomeAssetId} onChange={(event) => setIncomeAssetId(event.target.value)} required>{investmentAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}</select></label>
                    <label>Tipo<select value={incomeEventType} onChange={(event) => setIncomeEventType(event.target.value as IncomeEventRow["event_type"])}><option value="dividend">Dividendo</option><option value="jcp">Juros sobre capital próprio</option><option value="distribution">Distribuição</option><option value="coupon">Cupom</option><option value="interest">Juros</option><option value="amortization">Amortização</option><option value="other">Outro</option></select></label>
                    <label>Valor (R$)<input inputMode="decimal" value={incomeAmount} onChange={(event) => setIncomeAmount(event.target.value)} placeholder="0,00" required /></label>
                    <label>Data de referência<input type="date" value={incomeReferenceDate} onChange={(event) => setIncomeReferenceDate(event.target.value)} required /></label>
                    <label>Data de pagamento<input type="date" min={incomeReferenceDate} value={incomePaymentDate} onChange={(event) => setIncomePaymentDate(event.target.value)} /></label>
                    <label>Situação<select value={incomeStatus} onChange={(event) => { const next = event.target.value as IncomeEventRow["status"]; setIncomeStatus(next); if (next !== "received") setIncomeDestinationAccountId(""); }}><option value="announced">Anunciado</option><option value="planned">Previsto</option><option value="received" disabled={!incomeSettlementReady}>Recebido</option><option value="cancelled">Cancelado</option></select></label>
                    {incomeStatus === "received" && incomeSettlementReady && <label>Destino do provento<select value={incomeDestinationAccountId} onChange={(event) => setIncomeDestinationAccountId(event.target.value)} required><option value="">Selecione a conta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.account_type === "investment" ? " · reinvestir no caixa da corretora" : " · receber na conta"}</option>)}</select></label>}
                    {incomeStatus === "received" && !incomeSettlementReady && <p className="helper-text">A liquidação em conta será habilitada após a migration financeira ser ativada no Supabase.</p>}
                    {incomeStatus === "received" && investmentAssets.find((asset) => asset.id === incomeAssetId)?.currency === "USD" && <p className="helper-text">Ativos em USD podem ter proventos previstos, mas o crédito em conta ficará bloqueado até existir conversão cambial explícita.</p>}
                    <button className="primary-button" type="submit" disabled={busy}>Registrar provento</button>
                  </form></details>
                </>}
                {incomeEvents.length > 0 && <ul className="account-list">{incomeEvents.slice(0, 20).map((item) => {
                  const asset = investmentAssets.find((entry) => entry.id === item.asset_id);
                  const amount = item.status === "received" ? item.received_amount : item.announced_amount;
                  return <li key={item.id}><strong>{asset?.symbol ?? "Ativo"} · {item.event_type.toUpperCase()}</strong><span>{formatInvestmentCents(decimalToCents(amount), asset?.currency ?? "BRL")} · {item.status === "received" ? (item.settlement_state === "settled" ? "Recebido · lançado no saldo" : "Recebido · sem conciliação") : item.status === "cancelled" ? "Cancelado" : item.status === "planned" ? "Previsto" : "Anunciado"}</span><small>Referência: {item.reference_date}{item.payment_date ? ` · Pagamento: ${item.payment_date}` : ""}</small></li>;
                })}</ul>}
                <div className="income-calendar"><strong>Próximos pagamentos</strong>{incomeEvents.filter((item) => item.payment_date && item.payment_date >= todayInBrazil() && ["announced","planned"].includes(item.status)).sort((a,b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? "")).slice(0,6).map((item) => { const asset = investmentAssets.find((entry) => entry.id === item.asset_id); return <div key={item.id}><span>{item.payment_date}</span><b>{asset?.symbol ?? "Ativo"}</b><strong>{formatInvestmentCents(decimalToCents(item.announced_amount), asset?.currency ?? "BRL")}</strong></div>; })}{!incomeEvents.some((item) => item.payment_date && item.payment_date >= todayInBrazil() && ["announced","planned"].includes(item.status)) && <p className="empty-state">Nenhum pagamento futuro cadastrado.</p>}</div>
                <p className="helper-text">Os valores são lançados manualmente e não são previsões automáticas de mercado. Somente itens marcados como recebidos entram no total recebido; o histórico não altera automaticamente o saldo da conta.</p>
              </section>
            </section>

            <section className="panel planning-panel" id="planejamento" hidden={activeTab !== "planejamento"} aria-labelledby="planning-title">
              <div className="panel-heading"><div><span className="principles-label">OBJETIVOS E FUTURO</span><h2 id="planning-title">Metas e planejamento</h2><p>Acompanhe objetivos, registre contribuições e veja o progresso do que está construindo.</p></div></div>
              {signedIn && supabase && session && <ReceivablesPanel client={supabase} userId={session.user.id} accounts={accounts} onNotice={setNotice} onLedgerChange={requestLedgerRefresh} />}
                            <section className="planning-content" id="planejamento-metas" aria-labelledby="goals-title">
                <div className="transaction-heading"><strong id="goals-title">Metas financeiras</strong><span>{goals.length} cadastradas</span></div>
                <details className="management-drawer"><summary>＋ Criar nova meta</summary><form className="finance-form" onSubmit={(event) => void createGoal(event)}>
                  <label>Nome da meta<input value={goalName} onChange={(event) => setGoalName(event.target.value)} maxLength={100} placeholder="Ex.: Reserva de emergência" required /></label>
                  <label>Valor desejado (R$)<input inputMode="decimal" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder="0,00" required /></label>
                  <label>Contribuição mensal planejada (R$)<input inputMode="decimal" value={goalMonthly} onChange={(event) => setGoalMonthly(event.target.value)} placeholder="0,00" required /></label>
                  <label>Mês desejado (opcional)<input type="month" value={goalTargetMonth} onChange={(event) => setGoalTargetMonth(event.target.value)} /></label>
                  <button className="primary-button" type="submit" disabled={busy}>Criar meta</button>
                </form></details>
                {goals.length === 0 ? <p className="empty-state">Crie uma meta e registre contribuições para acompanhar sua evolução.</p> : <ul className="account-list">{goals.map((goal) => {
                  const current = decimalToCents(goal.current_amount);
                  const target = decimalToCents(goal.target_amount);
                  const percent = target > 0n ? Number((current * 100n) / target) : 0;
                  const reached = current >= target;
                  return <li key={goal.id}>
                    <strong>{goal.name}</strong>
                    <span>{formatCents(current)} de {formatCents(target)}</span>
                    <progress className="budget-progress" max={100} value={Math.min(100, percent)} aria-label={`Progresso da meta ${goal.name}`} />
                    <small>{Math.min(100, percent)}% concluído{reached ? " · Meta alcançada" : goal.target_month ? ` · Prazo: ${new Date(`${goal.target_month}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}` : ""} · Planejado por mês: {formatCents(decimalToCents(goal.monthly_contribution))}</small>
                    {goalContributions.some((item) => item.goal_id === goal.id) && <div className="goal-contribution-history"><small>Últimas contribuições</small>{goalContributions.filter((item) => item.goal_id === goal.id).slice(0, 5).map((item) => <small key={item.id}>{item.contribution_date} · {formatCents(decimalToCents(item.amount))}</small>)}</div>}
                    <details className="management-drawer goal-contribution-drawer"><summary>＋ Registrar contribuição</summary><form className="finance-form" onSubmit={(event) => { event.preventDefault(); void contributeToGoal(goal); }}>
                      <label>Adicionar contribuição (R$)<input inputMode="decimal" value={goalContributionAmounts[goal.id] ?? ""} onChange={(event) => setGoalContributionAmounts((currentAmounts) => ({ ...currentAmounts, [goal.id]: event.target.value }))} placeholder="0,00" required /></label>
                      <button className="primary-button" type="submit" disabled={busy}>Registrar contribuição</button>
                    </form></details>
                  </li>;
                })}</ul>}
                <p className="helper-text">As contribuições são registradas em histórico e atualizam o total de forma atômica. O valor planejado mensal não é contabilizado como dinheiro guardado.</p>
              </section>
            </section>
            <section className="panel" id="gastos" hidden={activeTab !== "gastos"} aria-labelledby="accounts-title">
              <div className="panel-heading"><div><span className="principles-label">BASE FINANCEIRA</span><h2 id="accounts-title">Contas e lançamentos</h2><p>Cadastre suas contas e registre receitas e despesas. Valores previstos permanecem separados dos realizados.</p></div></div>
              <nav className="section-jump" aria-label="Atalhos da área de gastos">
                <a href="#gastos-contas">Contas</a><a href="#gastos-cartoes">Cartões</a><a href="#gastos-categorias">Categorias</a><a href="#gastos-orcamentos">Orçamentos</a><a href="#gastos-recorrencias">Recorrências</a><a href="#gastos-lancamentos">Lançamentos</a><a href="#gastos-importacao">Importar</a><a href="#gastos-integracoes">Integrações</a>
              </nav>
              <div className="area-summary" aria-label="Resumo da área de gastos">
                <article><span>Contas</span><strong>{accounts.length}</strong><small>cadastradas</small></article>
                <article><span>Cartões</span><strong>{cards.length}</strong><small>cadastrados</small></article>
                <article><span>Despesas realizadas no mês</span><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transactions.filter((item) => item.kind === "expense" && item.status === "paid" && item.transaction_date.startsWith(currentBudgetDate.slice(0, 7))).reduce((sum, item) => sum + Number(item.amount), 0))}</strong><small>com base nos lançamentos carregados</small></article>
              </div>
              <section className="expense-overview" aria-label="Resumo de despesas do mês">
                <div className="transaction-heading"><strong>Gastos por categoria</strong><span>Despesas realizadas</span></div>
                {(() => {
                  const monthRows = transactions.filter((item) => item.kind === "expense" && item.status === "paid" && item.transaction_date.startsWith(currentBudgetDate.slice(0, 7)));
                  const rows = categories.filter((category) => category.kind === "expense").map((category) => ({ id: category.id, name: category.name, amount: monthRows.filter((item) => item.category_id === category.id).reduce((sum, item) => sum + Number(item.amount), 0) })).filter((item) => item.amount > 0).sort((a,b) => b.amount-a.amount);
                  const total = rows.reduce((sum,item) => sum+item.amount,0);
                  const palette = ["#EF4444","#3B82F6","#22C55E","#F59E0B","#9CA3AF","#A78BFA"];
                  let cursor = 0;
                  const gradient = rows.map((item,index) => { const from=cursor; cursor += total > 0 ? item.amount/total*100 : 0; return palette[index%palette.length]+" "+from+"% "+cursor+"%"; }).join(", ");
                  return total > 0 ? <div className="expense-chart-row"><div className="expense-donut" role="img" aria-label={"Total de gastos " + new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(total)} style={{background:"conic-gradient("+gradient+")"}}><span>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",notation:"compact",maximumFractionDigits:1}).format(total)}<small>Total</small></span></div><ul className="expense-legend">{rows.map((item,index) => <li key={item.id}><i style={{background:palette[index%palette.length]}}/><span>{item.name}</span><strong>{Math.round(item.amount/total*100)}%</strong></li>)}</ul></div> : <p className="empty-state">As categorias aparecerão aqui quando houver despesas realizadas neste mês.</p>;
                })()}
              </section>
              <details className="management-drawer"><summary>＋ Adicionar conta</summary><form className="finance-form" id="gastos-contas" onSubmit={(event) => void createAccount(event)}>
                <label>Nome da conta<input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={100} placeholder="Ex.: Conta principal" required /></label>
                <label>Banco ou instituição<select value={accountInstitutionKey} onChange={(event) => setAccountInstitutionKey(event.target.value)}><option value="">Selecione o banco (opcional)</option>{BANK_CATALOG.map((bank) => <option key={bank.logoKey} value={bank.logoKey}>{bank.name}{bank.code ? ` · ${bank.code}` : ""}</option>)}</select></label>
                {accountInstitutionKey && (() => { const bank = BANK_CATALOG.find((item) => item.logoKey === accountInstitutionKey); return bank ? <div className="bank-selected"><span className="bank-logo-sprite" style={bankLogoStyle(bank.logoIndex)} aria-hidden="true"/><strong>{bank.name}</strong><small>{bank.code ? `Código ${bank.code}` : "Instituição digital"}</small></div> : null; })()}
                <label>Tipo<select value={accountType} onChange={(event) => setAccountType(event.target.value)}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="investment">Investimentos</option><option value="other">Outra</option></select></label>
                <label>Saldo inicial (R$)<input inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0,00" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Adicionar conta</button>
              </form></details>
              {accounts.length > 0 ? <ul className="account-list">{accounts.map((account) => <li key={account.id}><strong>{account.name}{account.is_primary ? " · Principal" : ""}</strong><span className="account-institution">{account.institution_logo_key && BANK_CATALOG.some((bank) => bank.logoKey === account.institution_logo_key) ? <span className="bank-logo-sprite bank-logo-small" style={bankLogoStyle(BANK_CATALOG.find((bank) => bank.logoKey === account.institution_logo_key)!.logoIndex)} aria-hidden="true"/> : null}{account.institution_name || account.account_type}</span><small>Saldo atual: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(accountBalances[account.id] ?? Number(account.opening_balance))} · Saldo inicial: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(account.opening_balance))}</small></li>)}</ul> : <p className="empty-state">Cadastre sua primeira conta para começar.</p>}
              <section className="subpanel" id="gastos-cartoes" aria-labelledby="cards-title">
                <div className="transaction-heading"><strong id="cards-title">Cartões</strong><span>{cards.length} ativos</span></div>
                <details className="management-drawer"><summary>＋ Adicionar cartão</summary><form className="finance-form" onSubmit={(event) => void createCard(event)}>
                  <label>Nome do cartão<input value={cardName} onChange={(event) => setCardName(event.target.value)} maxLength={100} placeholder="Ex.: Cartão principal" required /></label>
                  <label>Instituição<input value={cardInstitution} onChange={(event) => setCardInstitution(event.target.value)} maxLength={120} placeholder="Banco ou instituição" required /></label>
                  <label>Últimos 4 dígitos<input inputMode="numeric" autoComplete="off" value={cardLastFour} onChange={(event) => setCardLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))} pattern="[0-9]{4}" maxLength={4} required /></label>
                  <label>Limite (R$)<input inputMode="decimal" value={cardLimit} onChange={(event) => setCardLimit(event.target.value)} required /></label>
                  <label>Fechamento<input type="number" min="1" max="31" value={cardClosingDay} onChange={(event) => setCardClosingDay(event.target.value)} required /></label>
                  <label>Vencimento<input type="number" min="1" max="31" value={cardDueDay} onChange={(event) => setCardDueDay(event.target.value)} required /></label>
                  <button className="primary-button" type="submit" disabled={busy}>Adicionar cartão</button>
                </form></details>
                {cards.length === 0 ? <p className="empty-state">Nenhum cartão cadastrado.</p> : <ul className="account-list card-list">{cards.map((card) => <li className="card-list-item" key={card.id}><strong>{card.name} · final {card.last_four}</strong><span>{card.institution_name}</span><small><span>Limite total: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(card.credit_limit))}</span><span>Utilizado: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cardCommittedAmounts[card.id] ?? 0)}</span><span>Disponível: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(card.credit_limit) - (cardCommittedAmounts[card.id] ?? 0))}</span><span>Fecha dia {card.closing_day} · Vence dia {card.due_day}</span><button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void archiveCard(card)}>Arquivar</button></small></li>)}</ul>}
                <div className="transaction-heading"><strong>Pagamento de fatura</strong><span>Pagamentos totais ou parciais</span></div>
                <details className="management-drawer"><summary>＋ Registrar pagamento de fatura</summary><form className="finance-form" onSubmit={(event) => void registerInvoicePayment(event)}>
                  <label>Cartão<select value={invoicePaymentCardId} onChange={(event) => setInvoicePaymentCardId(event.target.value)} required><option value="">Selecione</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · final {card.last_four}</option>)}</select></label>
                  <label>Data de fechamento da fatura<input type="date" value={invoiceClosingDate} onChange={(event) => setInvoiceClosingDate(event.target.value)} required /></label>
                  <label>Conta usada no pagamento<select value={invoicePaymentAccountId} onChange={(event) => setInvoicePaymentAccountId(event.target.value)} required><option value="">Selecione</option>{accounts.filter((account) => account.account_type !== "investment").map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label>Valor pago (R$)<input inputMode="decimal" value={invoicePaymentAmount} onChange={(event) => setInvoicePaymentAmount(event.target.value)} placeholder="0,00" required /></label>
                  <label>Data do pagamento<input type="date" max={todayInBrazil()} value={invoicePaymentDate} onChange={(event) => setInvoicePaymentDate(event.target.value)} required /></label>
                  <button className="primary-button" type="submit" disabled={busy || !cards.length || !accounts.some((account) => account.account_type !== "investment")}>Registrar pagamento</button>
                </form></details>
                <p className="helper-text">O pagamento reduz o saldo da conta escolhida e libera o limite correspondente. Não cria uma segunda despesa nos relatórios: as compras já foram contabilizadas no cartão.</p>
                {invoicePayments.length > 0 && <ul className="account-list invoice-payment-list">{invoicePayments.slice(0,8).map((payment) => {
                  const card = cards.find((item) => item.id === payment.card_id);
                  const account = accounts.find((item) => item.id === payment.account_id);
                  return <li key={payment.id}><strong>{card?.name ?? "Cartão"} · fatura fechada em {payment.invoice_closing_date}</strong><span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(payment.amount))} · {payment.payment_date}</span><small>Pago pela conta {account?.name ?? "arquivada"} <button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void deleteInvoicePayment(payment)}>Excluir pagamento</button></small></li>;
                })}</ul>}
              </section>
              <section className="subpanel" id="gastos-categorias" aria-labelledby="categories-title">
                <div className="transaction-heading"><strong id="categories-title">Categorias</strong><span>{categories.length} cadastradas</span></div>
                <details className="management-drawer"><summary>＋ Criar categoria</summary><form className="finance-form" onSubmit={(event) => void createCategory(event)}>
                  <label>Nome da categoria<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} placeholder="Ex.: Alimentação" required /></label>
                  <label>Tipo<select value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as "income" | "expense")}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                  <button className="primary-button" type="submit" disabled={busy}>Criar categoria</button>
                </form></details>
                {categories.length === 0 ? <p className="empty-state">Crie categorias para organizar seus lançamentos.</p> : <ul className="category-list">{categories.map((category) => <li key={category.id}><span>{category.kind === "income" ? "Receita" : "Despesa"}</span><strong>{category.name}</strong></li>)}</ul>}
              </section>
              <section className="subpanel" id="gastos-orcamentos" aria-labelledby="budgets-title">
                <div className="transaction-heading"><strong id="budgets-title">Orçamentos do mês</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${currentBudgetMonthStart}T12:00:00`))}</span></div>
                <details className="management-drawer"><summary>＋ Definir orçamento</summary><form className="finance-form" onSubmit={(event) => void saveBudget(event)}>
                  <label>Categoria<select value={budgetCategoryId} onChange={(event) => setBudgetCategoryId(event.target.value)} required><option value="">Selecione uma despesa</option>{categories.filter((category) => category.kind === "expense").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <label>Limite mensal (R$)<input inputMode="decimal" value={budgetLimit} onChange={(event) => setBudgetLimit(event.target.value)} placeholder="0,00" required /></label>
                  <button className="primary-button" type="submit" disabled={busy || categories.every((category) => category.kind !== "expense")}>Definir ou atualizar limite</button>
                </form></details>
                {budgets.length === 0 ? <p className="empty-state">Defina limites para acompanhar os gastos por categoria neste mês.</p> : <ul className="account-list">{budgets.map((budget) => {
                  const category = categories.find((item) => item.id === budget.category_id);
                  const spent = budgetSpend.filter((item) => item.category_id === budget.category_id).reduce((total, item) => total + decimalToCents(item.settled_amount), 0n);
                  const limit = decimalToCents(budget.limit_amount);
                  const percent = limit > 0n ? Number((spent * 100n) / limit) : 0;
                  const exceeded = spent > limit;
                  return <li key={budget.id}><strong>{category?.name ?? "Categoria"}</strong><span>{formatCents(spent)} de {formatCents(limit)}</span><progress className="budget-progress" max={100} value={Math.min(100, percent)} aria-label={`Uso do orçamento de ${category?.name ?? "categoria"}`} /><small>{percent}% utilizado{exceeded ? " · Limite ultrapassado" : " · Dentro do limite"}</small></li>;
                })}</ul>}
                <p className="helper-text">O gasto considera somente lançamentos de despesa com situação realizada e valor efetivamente liquidado no mês atual. Despesas previstas não entram no cálculo.</p>
              </section>
              <section className="subpanel" id="gastos-integracoes" aria-labelledby="whatsapp-title">
                <div className="transaction-heading"><strong id="whatsapp-title">WhatsApp</strong><span>{whatsappLink ? "Vinculado" : "Não vinculado"}</span></div>
                {whatsappLink ? <>
                  <p className="helper-text">Número vinculado: {whatsappLink.phone}</p>
                  <label className="inline-checkbox"><input type="checkbox" checked={whatsappSummaryEnabled} onChange={(event) => setWhatsappSummaryEnabled(event.target.checked)} /> Aceito receber um resumo financeiro semanal por WhatsApp.</label>
                  <div className="alert-actions"><button className="primary-button" type="button" onClick={() => void saveWhatsappSummaryPreference()} disabled={busy}>Salvar consentimento</button><button className="quiet-button danger-button" type="button" onClick={() => void unlinkWhatsapp()} disabled={busy}>Desvincular</button></div>
                </> : <>
                  <p className="helper-text">Gere um código temporário para vincular seu número quando o provedor oficial estiver configurado. Gerar o código não ativa resumos nem envia mensagens.</p>
                  <button className="primary-button" type="button" onClick={() => void generateWhatsappLinkCode()} disabled={busy}>Gerar código de vinculação</button>
                  {whatsappLinkCode && <p className="notice" aria-live="polite">Código temporário: <strong>{whatsappLinkCode}</strong>. Expira em 10 minutos.</p>}
                </>}
                <p className="helper-text">O envio e o recebimento reais ainda não estão ativos: falta escolher/configurar o provedor e o número oficial. Nenhuma mensagem foi enviada.</p>
              </section>
              <section className="subpanel" aria-labelledby="push-title">
                <div className="transaction-heading"><strong id="push-title">Notificações neste dispositivo</strong><span>{pushSubscriptions.length} inscrições na conta</span></div>
                <p className="helper-text">Ative para receber avisos quando o serviço de envio Push estiver configurado no backend. A permissão é solicitada pelo navegador.</p>
                <button className="primary-button" type="button" onClick={() => void togglePushNotifications()} disabled={busy}>
                  {pushSubscriptions.length > 0 ? "Gerenciar notificações deste dispositivo" : "Ativar notificações"}
                </button>
              </section>
              <section className="subpanel" id="gastos-importacao" aria-labelledby="imports-title">
                <div className="transaction-heading"><strong id="imports-title">Importar extrato bancário</strong><span>CSV / OFX</span></div>
                <p className="helper-text">Selecione o destino e um arquivo de até 5 MB. A prévia identifica duplicados antes de criar lançamentos realizados.</p>
                <div className="finance-form">
                  <label>Destino<select value={importDestinationType} onChange={(event) => { const next = event.target.value as "account" | "card"; setImportDestinationType(next); setImportDestinationId(next === "account" ? accounts[0]?.id ?? "" : cards[0]?.id ?? ""); setImportPreview([]); }}><option value="account">Conta</option><option value="card">Cartão</option></select></label>
                  <label>{importDestinationType === "account" ? "Conta" : "Cartão"}<select value={importDestinationId} onChange={(event) => { setImportDestinationId(event.target.value); setImportPreview([]); }} required><option value="">Selecione</option>{(importDestinationType === "account" ? accounts : cards).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Arquivo CSV ou OFX<input type="file" accept=".csv,.ofx,text/csv,application/x-ofx" onChange={(event) => void previewStatementFile(event.target.files?.[0])} disabled={busy} /></label>
                </div>
                {importPreview.length > 0 && <>
                  <div className="transaction-heading"><strong>Prévia do extrato</strong><span>{importPreview.filter((row) => !row.duplicate).length} novos · {importPreview.filter((row) => row.duplicate).length} duplicados</span></div>
                  <ul className="account-list">{importPreview.slice(0, 30).map((row, index) => <li key={row.dedupeKey + index}><strong>{row.description}</strong><span>{row.date} · {row.kind === "income" ? "Receita" : "Despesa"} · {formatCents(BigInt(row.amountCents))}</span><small>{row.duplicate ? "Já importado — será ignorado" : "Novo lançamento — será criado como realizado"}</small></li>)}</ul>
                  {importPreview.length > 30 && <p className="helper-text">Mostrando 30 de {importPreview.length} linhas; o lote completo será processado após sua confirmação.</p>}
                  <div className="alert-actions"><button className="primary-button" type="button" onClick={() => void confirmStatementImport()} disabled={busy || importPreview.every((row) => row.duplicate)}>Confirmar importação</button><button className="quiet-button" type="button" onClick={() => { setImportPreview([]); setImportFileName(""); setNotice("Prévia descartada."); }} disabled={busy}>Descartar prévia</button></div>
                </>}
              </section>
              
              
              
              <section className="subpanel" id="gastos-recorrencias" aria-labelledby="recurrences-title">
                <div className="transaction-heading"><strong id="recurrences-title">Recorrências</strong><span>{recurrences.filter((rule) => rule.is_active).length} ativas</span></div>
                <details className="management-drawer"><summary>＋ Criar recorrência</summary><form className="finance-form" onSubmit={(event) => void createRecurrence(event)}>
                  <label>Nome da regra<input value={recurrenceName} onChange={(event) => setRecurrenceName(event.target.value)} maxLength={100} placeholder="Ex.: Aluguel, salário, academia" required /></label>
                  <label>Tipo<select value={recurrenceKind} onChange={(event) => { const nextKind = event.target.value as "income" | "expense"; setRecurrenceKind(nextKind); setRecurrenceCategoryId(""); if (nextKind === "income") setRecurrenceCardId(""); }}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                  <label>Valor (R$)<input inputMode="decimal" value={recurrenceAmount} onChange={(event) => setRecurrenceAmount(event.target.value)} placeholder="0,00" required /></label>
                  <label>Frequência<select value={recurrenceFrequency} onChange={(event) => setRecurrenceFrequency(event.target.value as RecurrenceRow["frequency"])}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option><option value="interval">A cada intervalo de dias</option></select></label>
                  {recurrenceFrequency === "interval" && <label>Intervalo em dias<input type="number" min="1" max="366" value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)} required /></label>}
                  {recurrenceFrequency === "weekly" && <label>Dia da semana<select value={recurrenceWeekday} onChange={(event) => setRecurrenceWeekday(event.target.value)}>{["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"].map((day,index) => <option key={day} value={index}>{day}</option>)}</select></label>}
                  {(recurrenceFrequency === "monthly" || recurrenceFrequency === "yearly") && <label>Dia do mês<input type="number" min="1" max="31" value={recurrenceMonthDay} onChange={(event) => setRecurrenceMonthDay(event.target.value)} required /></label>}
                  {recurrenceFrequency === "yearly" && <label>Mês<select value={recurrenceMonth} onChange={(event) => setRecurrenceMonth(event.target.value)}>{["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((month,index) => <option key={month} value={index+1}>{month}</option>)}</select></label>}
                  <label>Começa em<input type="date" value={recurrenceStart} onChange={(event) => setRecurrenceStart(event.target.value)} required /></label>
                  <label>Termina em (opcional)<input type="date" min={recurrenceStart} value={recurrenceEnd} onChange={(event) => setRecurrenceEnd(event.target.value)} /></label>
                  <label>Categoria<select value={recurrenceCategoryId} onChange={(event) => setRecurrenceCategoryId(event.target.value)}><option value="">Sem categoria</option>{categories.filter((category) => category.kind === recurrenceKind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <label>Conta<select value={recurrenceAccountId} onChange={(event) => { setRecurrenceAccountId(event.target.value); if (event.target.value) setRecurrenceCardId(""); }}><option value="">Não vinculada</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label>Cartão<select value={recurrenceCardId} onChange={(event) => { setRecurrenceCardId(event.target.value); if (event.target.value) setRecurrenceAccountId(""); }} disabled={recurrenceKind !== "expense"}><option value="">Não vincular cartão</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · final {card.last_four}</option>)}</select></label>
                  <button className="primary-button" type="submit" disabled={busy}>Criar recorrência</button>
                </form></details>
                {recurrences.length === 0 ? <p className="empty-state">Cadastre uma regra para acompanhar despesas e receitas periódicas.</p> : <ul className="account-list">{recurrences.map((rule) => <li key={rule.id}><strong>{rule.name} · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(rule.amount))}</strong><span>{rule.kind === "income" ? "Receita" : "Despesa"} · {({daily:"Diária",weekly:"Semanal",biweekly:"Quinzenal",monthly:"Mensal",yearly:"Anual",interval:"Por intervalo"})[rule.frequency]}</span><small>Próxima data: {new Date(`${rule.next_occurrence_on}T12:00:00`).toLocaleDateString("pt-BR")} · {rule.is_active ? "Ativa" : "Pausada"}<button className="quiet-button" type="button" disabled={busy} onClick={() => void toggleRecurrence(rule)}>{rule.is_active ? "Pausar" : "Reativar"}</button></small></li>)}</ul>}
                <p className="helper-text">A regra apenas programa a próxima ocorrência. A geração de lançamentos será ativada com o processamento idempotente da agenda, sem marcar valores como realizados.</p>
              </section>
              <details className="management-drawer"><summary>＋ Novo lançamento</summary><form className="finance-form transaction-form" id="gastos-lancamentos" onSubmit={(event) => void createTransaction(event)}>
                <label>Tipo de lançamento<select value={txKind} onChange={(event) => { const nextKind = event.target.value as "income" | "expense" | "transfer"; setTxKind(nextKind); setTxCategoryId(""); setTxCardId(""); setTxPaymentMethod("pix"); }}><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência / aporte / resgate</option></select></label>
                <label>Situação<select value={txStatus} onChange={(event) => setTxStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label>
                <label>Valor (R$)<input inputMode="decimal" value={txAmount} onChange={(event) => setTxAmount(event.target.value)} placeholder="0,00" required /></label>
                <label>Data<input type="date" value={txDate} onChange={(event) => setTxDate(event.target.value)} required /></label>
                {txKind === "transfer" ? <>
                  <label>Conta de origem<select value={txTransferFromId} onChange={(event) => setTxTransferFromId(event.target.value)} required><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label>Conta de destino<select value={txTransferToId} onChange={(event) => setTxTransferToId(event.target.value)} required><option value="">Selecione</option>{accounts.filter((account) => account.id !== txTransferFromId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                </> : <>
                  {txKind === "expense" && <label>Como pagou?<select value={txPaymentMethod} onChange={(event) => { const method = event.target.value as "pix" | "debit" | "cash" | "credit"; setTxPaymentMethod(method); setTxAccountId(""); setTxCardId(""); setTxInstallmentCount("1"); }}><option value="pix">PIX</option><option value="debit">Débito</option><option value="cash">Dinheiro físico</option><option value="credit">Cartão de crédito</option></select></label>}
                  {!(txKind === "expense" && txPaymentMethod === "credit") && <label>Conta<select value={txAccountId} onChange={(event) => setTxAccountId(event.target.value)}><option value="">Selecione a conta</option>{accounts.filter((account) => account.account_type !== "investment" && (txKind !== "expense" || (txPaymentMethod === "cash" ? account.account_type === "cash" : account.account_type !== "cash"))).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
                  {txKind === "expense" && txPaymentMethod === "credit" && <label>Cartão de crédito<select value={txCardId} onChange={(event) => setTxCardId(event.target.value)} required><option value="">Selecione o cartão</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · final {card.last_four}</option>)}</select></label>}
                  {txKind === "expense" && txPaymentMethod === "credit" && txCardId && <label>Parcelamento<select value={txInstallmentCount} onChange={(event) => setTxInstallmentCount(event.target.value)}>{Array.from({ length: 48 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count === 1 ? "À vista" : `${count}x`}</option>)}</select></label>}
                  <label>Categoria<select value={txCategoryId} onChange={(event) => setTxCategoryId(event.target.value)}><option value="">Sem categoria</option>{categories.filter((category) => category.kind === txKind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                </>}
                <label className="wide-field">Descrição<input value={txDescription} onChange={(event) => setTxDescription(event.target.value)} maxLength={240} placeholder="Ex.: Mercado" required /></label>
                <button className="primary-button" type="submit" disabled={busy || (txKind === "expense" && txPaymentMethod === "credit" ? cards.length === 0 : txKind === "transfer" ? accounts.length < 2 : !accounts.some((account) => account.account_type !== "investment"))}>Salvar lançamento</button>
              </form></details>
              <div className="transaction-heading"><strong>Últimos lançamentos</strong><span>Até 30 registros</span></div>
              {transactions.length === 0 ? <p className="empty-state">Seus lançamentos aparecerão aqui.</p> : <ul className="transaction-list">{transactions.map((item) => <li key={item.id}><div className="transaction-main"><div><strong>{item.description}</strong><span>{item.kind === "income" ? "Receita" : item.kind === "expense" ? "Despesa" : `Transferência · ${accounts.find((account) => account.id === item.transfer_from_account_id)?.name ?? "Origem"} → ${accounts.find((account) => account.id === item.transfer_to_account_id)?.name ?? "Destino"}`} · {item.status === "paid" ? "Realizado" : item.status === "planned" ? "Previsto" : "Cancelado"}</span><small>{new Date(item.transaction_date + "T12:00:00").toLocaleDateString("pt-BR")}</small></div><strong className={item.kind === "income" ? "income-value" : "expense-value"}>{item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.amount))}</strong></div><div className="transaction-row-actions">{receiptFiles.some((file) => file.transaction_id === item.id) && <button className="quiet-button" type="button" disabled={busy} onClick={() => void openReceiptFile(item.id)}>Abrir comprovante</button>}<button className="quiet-button" type="button" disabled={busy} onClick={() => beginTransactionEdit(item)}>Editar</button><button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void deleteTransaction(item)}>Excluir</button></div>{editingTransactionId === item.id && <form className="transaction-edit-form" onSubmit={(event) => { event.preventDefault(); void saveTransactionEdit(item); }}><label>Descrição<input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={240} required /></label><label>Valor (R$)<input inputMode="decimal" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} required /></label><label>Data<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} required /></label><label>Situação<select value={editStatus} onChange={(event) => setEditStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label><button className="primary-button" type="submit" disabled={busy}>Salvar alterações</button><button className="quiet-button" type="button" disabled={busy} onClick={() => setEditingTransactionId(null)}>Cancelar</button></form>}</li>)}</ul>}
            </section>


            <section className="panel reports-panel" id="conta-relatorios" hidden={activeTab !== "relatorios"} aria-labelledby="reports-title">
              <span className="principles-label">ACOMPANHAMENTO DO MÊS</span>
              <h2 id="reports-title">Relatório mensal</h2>
              <p>Resumo calculado a partir dos lançamentos realizados no mês atual. Valores previstos não entram neste resultado.</p>
              {(() => {
                const rows = transactions.filter((item) => item.status === "paid" && item.transaction_date.startsWith(currentBudgetDate.slice(0, 7)));
                const income = rows.filter((item) => item.kind === "income").reduce((sum, item) => sum + Number(item.amount), 0);
                const expense = rows.filter((item) => item.kind === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
                const net = income - expense;
                const byCategory = categories.filter((category) => category.kind === "expense").map((category) => ({ name: category.name, amount: rows.filter((item) => item.kind === "expense" && item.category_id === category.id).reduce((sum, item) => sum + Number(item.amount), 0) })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
                const categoryTotal = byCategory.reduce((sum, item) => sum + item.amount, 0);
                return <><div className="report-metrics"><article><span>Receitas</span><strong className="amount-income">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(income)}</strong></article><article><span>Despesas</span><strong className="amount-expense">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(expense)}</strong></article><article><span>Resultado</span><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(net)}</strong></article></div><div className="transaction-heading"><strong>Despesas por categoria</strong><span>{byCategory.length} com movimento</span></div>{byCategory.length ? <ul className="report-category-list">{byCategory.map((item) => <li key={item.name}><div><strong>{item.name}</strong><span>{categoryTotal > 0 ? Math.round(item.amount / categoryTotal * 100) : 0}% · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.amount)}</span></div><progress className="budget-progress" max={100} value={categoryTotal > 0 ? item.amount / categoryTotal * 100 : 0} aria-label={`Participação de ${item.name} nas despesas`} /></li>)}</ul> : <p className="empty-state">Ainda não há despesas realizadas por categoria neste mês.</p>}</>;
              })()}
              <p className="helper-text">Relatório informativo baseado nos registros carregados. Não substitui extrato bancário ou documento fiscal.</p>
            </section>
            <section className="panel" id="conta-assistente" hidden={activeTab !== "conta"} aria-labelledby="assistant-title">
              <span className="principles-label">INTELIGÊNCIA ARTIFICIAL COM CONTROLE</span>
              <h2 id="assistant-title">Assistente financeiro</h2>
              <p>Faça uma pergunta sobre seus lançamentos recentes. Nenhum dado é enviado sem sua confirmação explícita nesta solicitação.</p>
              <form className="assistant-form" onSubmit={(event) => void askAssistant(event)}>
                <label>Pergunta<textarea value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} maxLength={1000} rows={3} placeholder="Ex.: Quais despesas recentes devo revisar?" required /></label>
                <label className="consent-row"><input type="checkbox" checked={assistantConsent} disabled={busy} onChange={(event) => setAssistantConsent(event.target.checked)} /> Li e autorizo o envio da pergunta e dos até 20 lançamentos recentes à IA para gerar esta resposta. O envio ocorre somente ao tocar em Perguntar.</label>
                <button className="primary-button" type="submit" disabled={busy || !assistantConsent || assistantQuestion.trim().length < 2}>Perguntar</button>
              </form>
              {assistantAnswer && <p className="assistant-answer" role="status">{assistantAnswer}</p>}
            </section>

            <section className="panel" id="conta-comprovante" hidden={activeTab !== "conta"} aria-labelledby="receipt-title">
              <span className="principles-label">LEITURA ASSISTIDA</span>
              <h2 id="receipt-title">Ler comprovante</h2>
              <p>Envie um PDF ou imagem para extrair uma prévia. O arquivo é processado em memória; esta etapa não armazena o anexo.</p>
              <form className="assistant-form" onSubmit={(event) => void readReceipt(event)}>
                <label>Arquivo<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { setReceiptFile(event.target.files?.[0] ?? null); setReceiptDraft(null); setReceiptConsent(false); }} /></label>
                <label className="consent-row"><input type="checkbox" checked={receiptConsent} disabled={busy} onChange={(event) => setReceiptConsent(event.target.checked)} /> Autorizo o envio deste arquivo à IA para leitura e extração de uma prévia.</label>
                <button className="primary-button" type="submit" disabled={busy || !receiptFile || !receiptConsent}>Analisar comprovante</button>
              </form>
              {receiptDraft && <div className="receipt-preview">
                <strong>{receiptDraft.sufficient ? "Revise os dados extraídos" : "Não foi possível extrair um lançamento único"}</strong>
                {receiptDraft.sufficient && <div className="receipt-edit-grid">
                  <label>Descrição<input value={receiptDraft.description ?? ""} onChange={(event) => patchReceiptDraft("description", event.target.value)} maxLength={80} required /></label>
                  <label>Tipo<select value={receiptDraft.kind ?? "expense"} onChange={(event) => patchReceiptDraft("kind", event.target.value as "income" | "expense")}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                  <label>Valor (R$)<input inputMode="decimal" value={receiptDraft.amount ?? ""} onChange={(event) => patchReceiptDraft("amount", event.target.value.replace(",", "."))} required /></label>
                  <label>Data<input type="date" value={receiptDraft.date ?? ""} onChange={(event) => patchReceiptDraft("date", event.target.value)} required /></label>
                  <label>Categoria<input value={receiptDraft.category ?? ""} onChange={(event) => patchReceiptDraft("category", event.target.value || null)} maxLength={80} placeholder="Opcional" /></label>
                  <label>Forma de pagamento<input value={receiptDraft.payment_method ?? ""} onChange={(event) => patchReceiptDraft("payment_method", event.target.value || null)} maxLength={40} placeholder="Opcional" /></label>
                </div>}
                {receiptDraft.warnings.length > 0 && <ul>{receiptDraft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
                {receiptDraft.sufficient && <><label>Conta para registrar<select value={receiptAccountId} onChange={(event) => setReceiptAccountId(event.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>{receiptDraft.installment_count && receiptDraft.installment_count > 1 && <p>Parcelamento identificado ({receiptDraft.installment_count} vezes). O registro parcelado ainda não está habilitado neste fluxo.</p>}<button className="primary-button" type="button" disabled={busy || !receiptAccountId || Boolean(receiptDraft.installment_count && receiptDraft.installment_count > 1)} onClick={() => void confirmReceiptDraft()}>Confirmar e criar lançamento</button></>}
              </div>}
              <p className="muted-copy">A confirmação cria somente o lançamento. O comprovante original fica armazenado em área privada, vinculado ao lançamento e acessível somente à sua conta.</p>
            </section>

            <section className="panel coming-panel" id="conta-proximos-passos" hidden={activeTab !== "conta"}><span className="principles-label">PRÓXIMAS CONEXÕES</span><h2>Seu financeiro em expansão</h2><p>As integrações externas dependem da configuração de cada serviço. Nenhuma automação ou notificação é ativada sem a autorização necessária.</p></section>
            {notice && <p className="notice" role="status">{notice}</p>}
          </section>
        )}

        {signedIn && <nav className={`bottom-nav${navigationHidden ? " is-hidden" : ""}`} aria-label="Navegação principal" aria-hidden={navigationHidden}>
          <button type="button" className={activeTab === "inicio" ? "active" : ""} aria-current={activeTab === "inicio" ? "page" : undefined} onClick={() => setActiveTab("inicio")}><Home size={20} strokeWidth={2.2} /><span>Início</span></button>
          <button type="button" className={activeTab === "gastos" ? "active" : ""} aria-current={activeTab === "gastos" ? "page" : undefined} onClick={() => setActiveTab("gastos")}><ReceiptText size={20} strokeWidth={2.2} /><span>Gastos</span></button>
          <button type="button" className={activeTab === "patrimonio" || activeTab === "planejamento" ? "active" : ""} aria-current={activeTab === "patrimonio" ? "page" : undefined} onClick={() => setActiveTab("patrimonio")}><TrendingUp size={20} strokeWidth={2.2} /><span>Patrimônio</span></button>
          <button type="button" className={activeTab === "conta" || activeTab === "relatorios" ? "active" : ""} aria-current={activeTab === "conta" ? "page" : undefined} onClick={() => setActiveTab("conta")}><UserRound size={20} strokeWidth={2.2} /><span>Conta</span></button>
        </nav>}
        <footer className="app-footer"><span>GRANAVIVA</span><span>Privacidade · Clareza · Gratuito para todos</span></footer>
      </div>
    </main>
  );
}
