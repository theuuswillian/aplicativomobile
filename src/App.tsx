import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Banknote, BarChart3, ChevronRight, CreditCard, Landmark, LogOut, Palette, Pencil, Plug, Plus, ReceiptText, Target, TrendingUp, Wallet, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import { formatDateBR, isIsoDate, isIsoMonth, todayInBrazil } from "./lib/date";
import { decimalToBrlInput, decimalToCents, formatBRL, formatBrlInput, parseBrlAmount, toCents } from "./lib/money";
import { normalizeInvestmentQuantity } from "./lib/investment-input";
import { errorMessage, authErrorMessage } from "./lib/errors";
import { formatCents, formatInvestmentCents } from "./lib/format";
import { expensesByCategory } from "./lib/finance-metrics";
import { BANK_CATALOG, findBank, findBankByCode, findBankByName } from "./data/bank-catalog";
import { INVESTMENT_CATALOG } from "./data/investment-catalog";
import { planDefaultCategorySync, suggestCategoryIcon, type CategoryKind } from "./data/default-categories";
import { isKnownCategoryIcon } from "./components/categories/category-icons";
import { CategoryCombobox, type ComboCategory } from "./components/categories/CategoryCombobox";
import { TransactionGlyph } from "./components/transactions/TransactionGlyph";
import { detectMerchant } from "./data/merchant-catalog";
import { clearFinancialRecordsForUser } from "./lib/secure-storage";
import { generateOccurrences } from "./domain/recurrence";
import { calculateInvestmentSummary, normalizeManualReferencePrice, type InvestmentOperation } from "./domain/investments";
import { parseCsvStatement, parseOfxStatement, planImportBatch } from "./domain/imports";
import { calculateAccountBalance, calculateCardCommittedLimitCents, calculateInvoice, type InvoicePayment, type LedgerEntry } from "./domain/finance";
import type { AccountBalanceRpcRow, AccountRow, BudgetRow, BudgetSpendRow, CardInvoiceInstallmentRow, CardInvoicePaymentRow, CardRow, CategoryRow, FinancialSummary, GoalContributionRow, GoalRow, ImportPreviewRow, IncomeEventRow, InvestmentAssetRow, InvestmentOperationRow, Profile, PushSubscriptionRow, RadarAlert, RadarFireRow, ReceiptDraft, ReceiptFileRow, RecurrenceRow, Theme, TransactionRow, WhatsappLinkState } from "./types/app";
import { ReceivablesPanel } from "./features/receivables/ReceivablesPanel";
import { IncomeGoalsPanel } from "./features/income-goals/IncomeGoalsPanel";
import { DashboardOverview } from "./features/dashboard/DashboardOverview";
import { WelcomeScreen } from "./features/auth/WelcomeScreen";
import { ReportsPanel } from "./features/reports/ReportsPanel";
import { FixedIncomeHub } from "./features/investments/FixedIncomeHub";
import { PortfolioAllocation } from "./features/investments/PortfolioAllocation";
import { QuickEntryModal } from "./features/transactions/QuickEntryModal";
import { Sidebar } from "./components/layout/Sidebar";
import { MobileHeader } from "./components/layout/MobileHeader";
import { GASTOS_VIEWS, screenDescription, screenTitle, type DashboardTab, type GastosView, type NavDestination } from "./components/layout/navigation";
import { DonutChart } from "./components/charts/DonutChart";
import { CHART_PALETTE } from "./components/charts/palette";
import { EmptyState, GoalProgress, ProgressBar } from "./components/ui";
import { CategoryIcon } from "./components/categories/CategoryIcon";

const TRANSACTION_PAGE_SIZE = 30;
const THEME_STORAGE_KEY = "granaviva:theme:v1";

function getInitialTheme(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function normalizeBrlAmount(value: string, allowZero = false, allowNegative = false): string | null {
  return parseBrlAmount(value, { allowZero, allowNegative });
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [editingAccountId,setEditingAccountId]=useState<string|null>(null);
  const [editingCardId,setEditingCardId]=useState<string|null>(null);
  const cardDrawerRef=useRef<HTMLDetailsElement>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("inicio");
  const [gastosView, setGastosView] = useState<GastosView>("lancamentos");
  const [transactionLimit, setTransactionLimit] = useState(TRANSACTION_PAGE_SIZE);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [quickEntryStep, setQuickEntryStep] = useState<"choose" | "form">("choose");
  const [balancesHidden, setBalancesHidden] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authMode, setAuthMode] = useState<"entrar" | "criar" | "recuperar">("entrar");
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
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
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
  const [fixedIncomeLiquidity, setFixedIncomeLiquidity] = useState<"daily" | "at_maturity" | "grace_period" | "unknown">("unknown");
  const [fixedIncomeGraceDays, setFixedIncomeGraceDays] = useState("");
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
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
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
  const accountDrawerRef = useRef<HTMLDetailsElement>(null);
  const investmentAssetDrawerRef = useRef<HTMLDetailsElement>(null);
  const activeUserIdRef = useRef<string | null>(null);
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
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (!notice || !session) return;
    const timer = window.setTimeout(() => setNotice(""), 7000);
    return () => window.clearTimeout(timer);
  }, [notice, session]);

  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* sessão continua funcional */ }
  }, [theme]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { activeUserIdRef.current = data.session?.user.id ?? null; setSession(data.session); setAuthReady(true); }
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = activeUserIdRef.current !== nextUserId;
      activeUserIdRef.current = nextUserId;
      setSession(nextSession);
      setNotice("");
      if (event === "PASSWORD_RECOVERY") { setRecoveryMode(true); setActiveTab("conta"); }
      if (!nextSession || (event === "SIGNED_IN" && userChanged)) {
        setProfile(null); setAlerts([]); setRadarFires([]); setAccounts([]); setCards([]); setCategories([]); setRecurrences([]); setBudgets([]); setGoals([]); setGoalContributions([]); setInvestmentAssets([]); setInvestmentOperations([]); setManualPriceInputs({}); setIncomeEvents([]); setPushSubscriptions([]); setWhatsappLink(null); setWhatsappLinkCode(""); setWhatsappSummaryEnabled(false); setIncomeAssetId(""); setIncomeAmount(""); setIncomeReferenceDate(todayInBrazil()); setIncomePaymentDate(""); setInvestmentSymbol(""); setInvestmentName(""); setInvestmentAssetId(""); setInvestmentQuantity(""); setInvestmentUnitPrice(""); setInvestmentFees("0,00"); setInvestmentDate(todayInBrazil()); setFixedIncomeProduct("CDB"); setFixedIncomeIssuer(""); setFixedIncomeIndexer("CDI"); setFixedIncomeRate(""); setFixedIncomeMaturity(""); setFixedIncomeNextYieldDate(""); setFixedIncomeStart(todayInBrazil()); setFixedIncomeFrequency("daily"); setAccountInstitutionKey(""); setGoalName(""); setGoalTarget(""); setGoalMonthly("0,00"); setGoalTargetMonth(""); setGoalContributionAmounts({}); setImportFormat("CSV"); setImportDestinationType("account"); setImportDestinationId(""); setImportFileName(""); setImportPreview([]); setBudgetSpend([]); setTransactions([]); setTxCategoryId(""); setBudgetCategoryId(""); setBudgetLimit(""); setRecurrenceCategoryId(""); setRecurrenceAccountId(""); setRecurrenceCardId(""); setRecurrenceName(""); setRecurrenceAmount(""); setRecurrenceEnd(""); setRecurrenceStart(todayInBrazil());
        setTxAccountId(""); setTxCardId(""); setTxInstallmentCount("1"); setReceiptAccountId(""); setEditingTransactionId(null);
        setAssistantAnswer(""); setAssistantQuestion(""); setAssistantConsent(false);
        setReceiptDraft(null); setReceiptFile(null); setReceiptFiles([]); setReceiptConsent(false);
        setDataLoaded(false);
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
        if (!active) return;
        const loadFailures: string[] = [];
        if (account.error) loadFailures.push("perfil");
        if (preferences.error) loadFailures.push("preferências");
        if (radar.error) loadFailures.push("Radar");
        if (radarFireRows.error) loadFailures.push("histórico do Radar");
        if (pushRows.error) loadFailures.push("notificações");
        if (whatsappRows.error) loadFailures.push("WhatsApp");
        if (receiptFileRows.error) loadFailures.push("comprovantes");
        if (accountRows.error) loadFailures.push("contas");
        if (transactionRows.error) loadFailures.push("lançamentos");
        if (cardRows.error) loadFailures.push("cartões");
        if (invoicePaymentRows.error) loadFailures.push("pagamentos de fatura");
        if (cardInvoiceInstallmentRows.error) loadFailures.push("parcelas de cartão");
        if (categoryRows.error) loadFailures.push("categorias");
        if (recurrenceRows.error) loadFailures.push("recorrências");
        if (budgetRows.error || budgetSpendRows.error) loadFailures.push("orçamentos");
        if (goalRows.error || goalContributionRows.error) loadFailures.push("metas");
        if (investmentAssetRows.error || investmentOperationRows.error) loadFailures.push("investimentos");
        if (incomeEventRows.error || incomeEventSettlementRows.error) loadFailures.push("proventos");
        if (!account.error) setProfile(account.data?.data?.profile ?? null);
        const serverTheme = preferences.error ? null : preferences.data?.data?.theme;
        if (serverTheme === "light" || serverTheme === "dark") setTheme(serverTheme);
        if (!radar.error) setAlerts(Array.isArray(radar.data?.data) ? radar.data.data as RadarAlert[] : []);
        if (!radarFireRows.error) setRadarFires(Array.isArray(radarFireRows.data?.data) ? radarFireRows.data.data as RadarFireRow[] : []);
        if (!accountRows.error) setAccounts((accountRows.data ?? []) as AccountRow[]);
        if (!cardRows.error) setCards((cardRows.data ?? []) as CardRow[]);
        if (!invoicePaymentRows.error) setInvoicePayments((invoicePaymentRows.data ?? []) as CardInvoicePaymentRow[]);
        if (!cardInvoiceInstallmentRows.error) setCardInstallments((cardInvoiceInstallmentRows.data ?? []) as CardInvoiceInstallmentRow[]);
        if (!cardRows.error && cardRows.data?.[0]?.id) setInvoicePaymentCardId((current) => current || cardRows.data[0].id);
        if (!accountRows.error && accountRows.data?.[0]?.id) setInvoicePaymentAccountId((current) => current || accountRows.data[0].id);
        if (!categoryRows.error) {
          setCategories((categoryRows.data ?? []) as CategoryRow[]);
          // Sincroniza as categorias padrão sem duplicar: aproveita nomes antigos (aliases) e troca emojis por ícones.
          const plan=planDefaultCategorySync((categoryRows.data ?? []) as CategoryRow[],isKnownCategoryIcon);
          if(plan.inserts.length||plan.updates.length){
            void (async()=>{
              if(plan.inserts.length){
                const {error}=await client.from("categories").upsert(plan.inserts.map((item)=>({user_id:session.user.id,...item})),{onConflict:"user_id,kind,normalized_name",ignoreDuplicates:true});
                if(error)return;
              }
              await Promise.all(plan.updates.map((item)=>client.from("categories").update({icon:item.icon,color:item.color}).eq("id",item.id).eq("user_id",session.user.id)));
              if(!active)return;
              const {data,error:refreshError}=await client.from("categories").select("id,name,kind,color,icon").eq("user_id",session.user.id).order("kind",{ascending:true}).order("name",{ascending:true});
              if(!refreshError&&active&&data)setCategories(data as CategoryRow[]);
            })();
          }
        }
        if (!recurrenceRows.error) setRecurrences((recurrenceRows.data ?? []) as RecurrenceRow[]);
        if (!budgetRows.error) setBudgets((budgetRows.data ?? []) as BudgetRow[]);
        if (!budgetSpendRows.error) setBudgetSpend((budgetSpendRows.data ?? []) as BudgetSpendRow[]);
        if (!goalRows.error) setGoals((goalRows.data ?? []) as GoalRow[]);
        if (!goalContributionRows.error) setGoalContributions((goalContributionRows.data ?? []) as GoalContributionRow[]);
        if (!investmentAssetRows.error) setInvestmentAssets((investmentAssetRows.data ?? []) as InvestmentAssetRow[]);
        if (!investmentOperationRows.error) setInvestmentOperations((investmentOperationRows.data ?? []) as InvestmentOperationRow[]);
        setIncomeSettlementReady(!incomeEventSettlementRows.error);
        if (!incomeEventRows.error) {
          const settlementById = new Map((incomeEventSettlementRows.data ?? []).map((row) => [row.id, row]));
          setIncomeEvents(((incomeEventRows.data ?? []) as Omit<IncomeEventRow, "account_id" | "transaction_id" | "settlement_state">[]).map((row) => ({
            ...row,
            ...(settlementById.get(row.id) ?? { account_id: null, transaction_id: null, settlement_state: "unsettled" as const }),
          })));
        }
        if (!pushRows.error) setPushSubscriptions((pushRows.data?.data ?? []) as PushSubscriptionRow[]);
        if (!whatsappRows.error) {
          setWhatsappLink(whatsappRows.data?.data?.linked ? { phone: whatsappRows.data.data.phone, weekly_summary_enabled: whatsappRows.data.data.weekly_summary_enabled } : null);
          setWhatsappSummaryEnabled(Boolean(whatsappRows.data?.data?.weekly_summary_enabled));
        }
        if (!receiptFileRows.error) setReceiptFiles((receiptFileRows.data ?? []) as ReceiptFileRow[]);
        if (!investmentAssetRows.error && investmentAssetRows.data?.[0]?.id) setIncomeAssetId((current) => current || investmentAssetRows.data[0].id);
        if (!investmentAssetRows.error && investmentAssetRows.data?.[0]?.id) setInvestmentAssetId((current) => current || investmentAssetRows.data[0].id);
        if (!transactionRows.error) setTransactions((transactionRows.data ?? []) as TransactionRow[]);
        const firstLiquidAccount = accountRows.error ? undefined : accountRows.data?.find((account) => account.account_type !== "investment");
        if (firstLiquidAccount?.id) setTxAccountId((current) => current || firstLiquidAccount.id);
        if (firstLiquidAccount?.id) setReceiptAccountId((current) => current || firstLiquidAccount.id);
        if (firstLiquidAccount?.id) setImportDestinationId((current) => current || firstLiquidAccount.id);
        if (loadFailures.length) setNotice(`Alguns dados não carregaram: ${loadFailures.join(", ")}. Os demais continuam disponíveis; tente atualizar a tela.`);
        setDataLoaded(true);
      } catch (error) {
        if (active) { setNotice(errorMessage(error)); setDataLoaded(true); }
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
      setFinancialSummary(data as FinancialSummary);
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
      if (authMode === "recuperar") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setNotice("Se este e-mail tiver uma conta, você receberá um link para criar uma nova senha.");
      } else if (authMode === "entrar") {
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
    } catch (error) { setNotice(authErrorMessage(error)); }
    finally { setBusy(false); }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (newPassword.length < 8) { setNotice("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    setBusy(true); setNotice("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword(""); setRecoveryMode(false);
      setNotice("Senha atualizada com sucesso.");
    } catch (error) { setNotice(authErrorMessage(error)); }
    finally { setBusy(false); }
  }

  /** Troca de aba sempre começa do topo (ou rola até a seção pedida). */
  function goTo(tab: DashboardTab, options: { view?: GastosView; anchor?: string } = {}) {
    setActiveTab(tab);
    if (options.view) setGastosView(options.view);
    // Sem âncora, volta ao topo na hora (evita corrida com a rolagem do usuário).
    if (!options.anchor) { window.scrollTo({ top: 0 }); return; }
    const anchor = options.anchor;
    window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  /** Abre o formulário de lançamento (no modal) já no tipo escolhido. */
  function openTransactionForm(kind: "income" | "expense" | "transfer") {
    setTxKind(kind); setTxPaymentMethod("pix"); setTxAccountId(""); setTxCardId(""); setTxCategoryId(""); setTxInstallmentCount("1");
    setQuickEntryStep("form");
    setQuickEntryOpen(true);
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

  function beginAccountEdit(account:AccountRow){
    setEditingAccountId(account.id);setAccountName(account.name);setAccountInstitutionKey(account.institution_logo_key??"");setAccountType(account.account_type);setOpeningBalance(decimalToBrlInput(account.opening_balance));
    if(accountDrawerRef.current)accountDrawerRef.current.open=true;
    setGastosView("contas");
    document.getElementById("gastos-contas")?.scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function archiveAccount(account:AccountRow){
    if(!supabase||!session||!window.confirm("Excluir a conta "+account.name+" da lista? O histórico financeiro será preservado."))return;
    setBusy(true);setNotice("");
    try{
      const {error}=await supabase.from("accounts").update({is_archived:true,archived_at:new Date().toISOString(),is_primary:false}).eq("id",account.id).eq("user_id",session.user.id);
      if(error)throw error;
      setAccounts(current=>current.filter(item=>item.id!==account.id));
      if(account.is_primary){
        const {data:nextAccounts,error:lookupError}=await supabase.from("accounts").select("id").eq("user_id",session.user.id).eq("is_archived",false).order("created_at",{ascending:true}).limit(1);
        if(lookupError)throw lookupError;
        if(nextAccounts?.[0]){const {error:primaryError}=await supabase.from("accounts").update({is_primary:true}).eq("id",nextAccounts[0].id).eq("user_id",session.user.id);if(primaryError)throw primaryError;setAccounts(current=>current.map(item=>item.id===nextAccounts[0].id?{...item,is_primary:true}:item));}
      }
      setNotice("Conta excluída da lista. Lançamentos e histórico foram preservados.");
    }catch(error){setNotice(errorMessage(error));}finally{setBusy(false);}
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setNotice("O GranaViva está sem conexão com o serviço financeiro. Recarregue a página e tente novamente.");
      return;
    }
    if (!session?.user?.id) {
      setNotice("Sua sessão expirou. Entre novamente para cadastrar uma conta.");
      return;
    }
    const cleanName = accountName.trim();
    const amount = normalizeBrlAmount(openingBalance, true, true);
    if (!cleanName || cleanName.length > 100 || !amount) {
      setNotice("Informe um nome válido e confira o saldo inicial da conta.");
      return;
    }
    const institution = findBank(accountInstitutionKey);
    setBusy(true);
    setNotice("");
    try {
      let created:AccountRow;
      if(editingAccountId){
        const {data,error}=await supabase.from("accounts").update({name:cleanName,account_type:accountType,institution_name:institution?.name??null,institution_code:institution?.code||null,institution_logo_key:institution?.logoKey??null,opening_balance:amount}).eq("id",editingAccountId).eq("user_id",session.user.id).select("id,name,account_type,opening_balance,opening_balance_date,is_primary,institution_name,institution_code,institution_logo_key").single();
        if(error)throw error;created=data as AccountRow;setAccounts(current=>current.map(item=>item.id===created.id?created:item));setNotice("Conta atualizada com sucesso.");
      }else{
        const {data:primaryAccounts,error:primaryLookupError}=await supabase.from("accounts").select("id").eq("user_id",session.user.id).eq("is_primary",true).limit(1);
        if(primaryLookupError)throw primaryLookupError;
        const {data,error}=await supabase.from("accounts").insert({user_id:session.user.id,name:cleanName,account_type:accountType,institution_name:institution?.name??null,institution_code:institution?.code||null,institution_logo_key:institution?.logoKey??null,opening_balance:amount,opening_balance_date:todayInBrazil(),is_primary:!(primaryAccounts?.[0])}).select("id,name,account_type,opening_balance,opening_balance_date,is_primary,institution_name,institution_code,institution_logo_key").single();
        if(error)throw error;if(!data?.id)throw new Error("O banco não confirmou o cadastro da conta.");created=data as AccountRow;setAccounts(current=>[...current,created]);setNotice("Conta adicionada com sucesso.");
      }
      if (created.account_type !== "investment") {
        setTxAccountId((current) => current || created.id);
        setReceiptAccountId((current) => current || created.id);
      }
      setEditingAccountId(null);
      setAccountName("");
      setAccountInstitutionKey("");
      setOpeningBalance("0,00");
      if (accountDrawerRef.current) accountDrawerRef.current.open = false;
    } catch (error) {
      setNotice(`Não foi possível adicionar a conta. ${errorMessage(error)}${error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string" ? ` (código ${(error as { code: string }).code})` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  function beginCardEdit(card:CardRow){
    setEditingCardId(card.id);setCardName(card.name);setCardInstitution(card.institution_name);setCardLastFour(card.last_four);setCardLimit(decimalToBrlInput(card.credit_limit));setCardClosingDay(String(card.closing_day));setCardDueDay(String(card.due_day));
    if(cardDrawerRef.current)cardDrawerRef.current.open=true;
    setGastosView("contas");
    document.getElementById("gastos-cartoes")?.scrollIntoView({behavior:"smooth",block:"start"});
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
      if(editingCardId){
        const {data,error}=await supabase.from("cards").update({name:cardName.trim(),institution_name:cardInstitution.trim(),last_four:cardLastFour,credit_limit:limit,closing_day:closing,due_day:due}).eq("id",editingCardId).eq("user_id",session.user.id).select("id,name,institution_name,last_four,brand,credit_limit,closing_day,due_day,is_archived").single();
        if(error)throw error;setCards(current=>current.map(item=>item.id===editingCardId?data as CardRow:item));setNotice("Cartão atualizado.");
      }else{
        const {data,error}=await supabase.from("cards").insert({user_id:session.user.id,name:cardName.trim(),institution_name:cardInstitution.trim(),last_four:cardLastFour,credit_limit:limit,closing_day:closing,due_day:due}).select("id,name,institution_name,last_four,brand,credit_limit,closing_day,due_day,is_archived").single();
        if(error)throw error;setCards(current=>[...current,data as CardRow]);setNotice("Cartão cadastrado.");
      }
      setEditingCardId(null);setCardName(""); setCardInstitution(""); setCardLastFour(""); setCardLimit("0,00");if(cardDrawerRef.current)cardDrawerRef.current.open=false;
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

  const sortCategories = (list: CategoryRow[]) => [...list].sort((a,b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "pt-BR"));

  /** Cria categoria direto do seletor (CategoryCombobox). */
  async function createCategoryNamed(name: string, kind: CategoryKind): Promise<ComboCategory | null> {
    if (!supabase || !session || !name.trim()) return null;
    const visual = suggestCategoryIcon(name, kind);
    try {
      const { data, error } = await supabase.from("categories").insert({
        user_id: session.user.id, name: name.trim(), kind, icon: visual.icon, color: visual.color,
      }).select("id,name,kind,color,icon").single();
      if (error) throw error;
      setCategories((current) => sortCategories([...current, data as CategoryRow]));
      return data as CategoryRow;
    } catch (error) { setNotice(errorMessage(error)); return null; }
  }

  async function renameCategory(id: string, name: string): Promise<boolean> {
    if (!supabase || !session) return false;
    try {
      const { data, error } = await supabase.from("categories").update({ name: name.trim() }).eq("id", id).eq("user_id", session.user.id).select("id,name,kind,color,icon").single();
      if (error) throw error;
      setCategories((current) => sortCategories(current.map((item) => item.id === id ? data as CategoryRow : item)));
      return true;
    } catch (error) { setNotice(errorMessage(error)); return false; }
  }

  /** Exclui categoria; se estiver em uso (FK ON DELETE RESTRICT), devolve uma explicação amigável. */
  async function deleteCategory(id: string): Promise<string | null> {
    if (!supabase || !session) return "Sessão indisponível. Entre novamente.";
    const { error } = await supabase.from("categories").delete().eq("id", id).eq("user_id", session.user.id);
    if (error) {
      if (error.code === "23503") return "Essa categoria está em uso em lançamentos, orçamentos ou recorrências. Renomeie-a ou mova esses itens para outra categoria antes de excluir.";
      return errorMessage(error);
    }
    setCategories((current) => current.filter((item) => item.id !== id));
    if (budgetCategoryId === id) setBudgetCategoryId("");
    if (recurrenceCategoryId === id) setRecurrenceCategoryId("");
    return null;
  }
  const categoryPickerProps = { categories, onCreate: createCategoryNamed, onRename: renameCategory, onDelete: deleteCategory };


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
    const nameValue = investmentName.trim();
    const enteredSymbol = investmentSymbol.trim().toUpperCase();
    const symbolValue = enteredSymbol || (investmentClass === "fixed_income" ? `RF${Date.now().toString(36).toUpperCase()}` : "");
    if (!/^[A-Z0-9.]{1,32}$/.test(symbolValue) || !nameValue || nameValue.length > 120) {
      setNotice(investmentClass === "fixed_income" ? "Informe a identificação (ou deixe em branco) e o nome do título." : "Informe um ticker válido e o nome do ativo.");
      return;
    }
    const fixedRate = fixedIncomeRate.trim().replace(",", ".");
    const isoDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
    const validMaturity = !fixedIncomeMaturity || (isoDate(fixedIncomeMaturity) && fixedIncomeMaturity > fixedIncomeStart);
    const validNextYield = !fixedIncomeNextYieldDate || (isoDate(fixedIncomeNextYieldDate) &&
      fixedIncomeNextYieldDate >= fixedIncomeStart && (!fixedIncomeMaturity || fixedIncomeNextYieldDate <= fixedIncomeMaturity));
    if (investmentClass === "fixed_income" && (!fixedIncomeProduct.trim() || !isoDate(fixedIncomeStart) ||
        !validMaturity || !validNextYield ||
        !/^[0-9]{1,3}(?:[.][0-9]{1,4})?$/.test(fixedRate) || Number(fixedRate) <= 0 || Number(fixedRate) > 1000)) {
      setNotice("Confira o produto, indexador, taxa e datas da renda fixa.");
      return;
    }
    const metadata = investmentClass === "fixed_income" ? {
      fixed_income: {
        product: fixedIncomeProduct, issuer: fixedIncomeIssuer.trim(), indexer: fixedIncomeIndexer,
        annual_rate_percent: fixedRate, start_date: fixedIncomeStart, maturity_date: fixedIncomeMaturity || null,
        next_yield_date: fixedIncomeNextYieldDate || null, yield_frequency: fixedIncomeFrequency,
        liquidity: fixedIncomeLiquidity, grace_period_days: fixedIncomeLiquidity === "grace_period" ? Number(fixedIncomeGraceDays) || null : null,
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
      setFixedIncomeIssuer(""); setFixedIncomeRate(""); setFixedIncomeMaturity(""); setFixedIncomeLiquidity("unknown"); setFixedIncomeGraceDays("");
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
    const parsedQuantity = normalizeInvestmentQuantity(investmentQuantity);
    const quantityAtoms = parsedQuantity?.atoms ?? 0n;
    const quantity = Number(quantityAtoms) / 100_000_000;
    const quantityNormalized = parsedQuantity?.normalized ?? "0.00000000";
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
        (goalTargetMonth && !isIsoMonth(goalTargetMonth))) {
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
      // O PostgREST devolve `numeric` como número JSON; aceita os dois formatos.
      if (!result || (typeof result.current_amount !== "string" && typeof result.current_amount !== "number")) throw new Error("Não foi possível confirmar o saldo atualizado da meta.");
      setGoals((current) => current.map((item) => item.id === goal.id
        ? { ...item, current_amount: String(result.current_amount) } : item));
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
    if (!amount || !card || !account || account.account_type === "investment" || !isIsoDate(invoiceClosingDate) ||
        !isIsoDate(invoicePaymentDate) || invoicePaymentDate > today) {
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
      setQuickEntryOpen(false);
      setNotice(txStatus === "paid" ? "Lançamento realizado criado." : "Lançamento previsto criado.");
      await refreshBudgetSpend();
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function beginTransactionEdit(item: TransactionRow) {
    setEditingTransactionId(item.id);
    setEditDescription(item.description);
    setEditAmount(decimalToBrlInput(item.amount));
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
    const value = condition === "daily_drop"
      ? Number(threshold.trim().replace(",", "."))
      : Number(parseBrlAmount(threshold) ?? Number.NaN);
    if (!Number.isFinite(value) || value <= 0 || (condition === "daily_drop" && value > 100) || !symbol.trim()) {
      setNotice(condition === "daily_drop" ? "Informe o ativo e uma queda entre 0,01% e 100%." : "Informe o ativo e um valor de preço válido.");
      return;
    }
    setBusy(true); setNotice("");
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

  const userDisplayName = (profile?.display_name || "").trim();
  const firstName = userDisplayName.split(/\s+/)[0];
  const greetingHour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const greeting = greetingHour < 12 ? "Bom dia" : greetingHour < 18 ? "Boa tarde" : "Boa noite";
  const investedTotals = investmentAssets.reduce((sum, asset) => {
    const summary = investmentSummary(asset.id);
    const currentPrice = asset.current_price == null ? null : Number(asset.current_price);
    const amount = summary.quantity > 0 ? (currentPrice != null && currentPrice > 0 ? currentPrice * summary.quantity : Number(summary.costBasisCents) / 100) : 0;
    if (asset.currency === "USD") sum.usd += amount; else sum.brl += amount;
    return sum;
  }, { brl: 0, usd: 0 });
  const investedBrl = financialSummary?.investment_reference_brl == null ? investedTotals.brl : Number(financialSummary.investment_reference_brl);
  const investedUsd = financialSummary?.investment_reference_usd == null ? investedTotals.usd : Number(financialSummary.investment_reference_usd);
  const navigate = (item: NavDestination) => { setDrawerOpen(false); goTo(item.tab, item.view ? { view: item.view } : {}); };
  const openFixedIncomeForm = () => { setInvestmentClass("fixed_income"); setInvestmentCurrency("BRL"); if (investmentAssetDrawerRef.current) investmentAssetDrawerRef.current.open = true; };

  const txMerchant = txKind === "transfer" ? null : detectMerchant(txDescription);
  const txSuggestedCategory = txMerchant?.categoryHint ? categories.find((category) => category.kind === txKind && category.name === txMerchant.categoryHint) ?? null : null;
  const transactionForm = (
              <form className="finance-form transaction-form" onSubmit={(event) => void createTransaction(event)}>
                <div className="wide-field tx-description-field">
                  <label htmlFor="tx-description">Descrição</label>
                  <div className={"tx-description-control" + (txMerchant ? " has-merchant" : "")}>
                    {txMerchant && <img className="brand-tile merchant-logo" src={txMerchant.logoPath} alt="" aria-hidden="true" width={28} height={28} />}
                    <input id="tx-description" value={txDescription} onChange={(event) => setTxDescription(event.target.value)} maxLength={240} placeholder="Ex.: Uber, iFood, Mercado" autoComplete="off" required aria-describedby={txMerchant ? "tx-merchant-hint" : undefined} />
                  </div>
                  {txMerchant && <p className="tx-merchant-hint" id="tx-merchant-hint" role="status"><span>Reconhecido: <strong>{txMerchant.name}</strong></span>{txSuggestedCategory && txSuggestedCategory.id !== txCategoryId && <button type="button" className="link-button" onClick={() => setTxCategoryId(txSuggestedCategory.id)}>Usar categoria “{txSuggestedCategory.name}”</button>}</p>}
                </div>

                <label>Tipo de lançamento<select value={txKind} onChange={(event) => { const nextKind = event.target.value as "income" | "expense" | "transfer"; setTxKind(nextKind); setTxCategoryId(""); setTxCardId(""); setTxPaymentMethod("pix"); }}><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência / aporte / resgate</option></select></label>
                <label>Situação<select value={txStatus} onChange={(event) => setTxStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label>
                <label>Valor (R$)<input inputMode="decimal" value={txAmount} onChange={(event) => setTxAmount(formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
                <label>Data<input type="date" value={txDate} onChange={(event) => setTxDate(event.target.value)} required /></label>
                {txKind === "transfer" ? <>
                  <label>Conta de origem<select value={txTransferFromId} onChange={(event) => setTxTransferFromId(event.target.value)} required><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label>Conta de destino<select value={txTransferToId} onChange={(event) => setTxTransferToId(event.target.value)} required><option value="">Selecione</option>{accounts.filter((account) => account.id !== txTransferFromId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                </> : <>
                  {txKind === "expense" && <label>Como pagou?<select value={txPaymentMethod} onChange={(event) => { const method = event.target.value as "pix" | "debit" | "cash" | "credit"; setTxPaymentMethod(method); setTxAccountId(""); setTxCardId(""); setTxInstallmentCount("1"); }}><option value="pix">PIX</option><option value="debit">Débito</option><option value="cash">Dinheiro físico</option><option value="credit">Cartão de crédito</option></select></label>}
                  {!(txKind === "expense" && txPaymentMethod === "credit") && <label>Conta<select value={txAccountId} onChange={(event) => setTxAccountId(event.target.value)}><option value="">Selecione a conta</option>{accounts.filter((account) => account.account_type !== "investment" && (txKind !== "expense" || (txPaymentMethod === "cash" ? account.account_type === "cash" : account.account_type !== "cash"))).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
                  {txKind === "expense" && txPaymentMethod === "credit" && <label>Cartão de crédito<select value={txCardId} onChange={(event) => setTxCardId(event.target.value)} required><option value="">Selecione o cartão</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · final {card.last_four}</option>)}</select></label>}
                  {txKind === "expense" && txPaymentMethod === "credit" && txCardId && <label>Parcelamento<select value={txInstallmentCount} onChange={(event) => setTxInstallmentCount(event.target.value)}>{Array.from({ length: 48 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count === 1 ? "À vista" : `${count}x`}</option>)}</select></label>}
                  <CategoryCombobox {...categoryPickerProps} label="Categoria" kind={txKind === "income" ? "income" : "expense"} value={txCategoryId} onChange={setTxCategoryId} />
                </>}
                <button className="primary-button" type="submit" disabled={busy || (txKind === "expense" && txPaymentMethod === "credit" ? cards.length === 0 : txKind === "transfer" ? accounts.length < 2 : !accounts.some((account) => account.account_type !== "investment"))}>Salvar lançamento</button>
              </form>
  );

  return (
    <main className="app-shell" data-theme={theme} data-balances-hidden={balancesHidden ? "true" : "false"}>
      <div className={"app-frame" + (signedIn ? " is-authenticated" : "")}>
        {!signedIn ? (
          <WelcomeScreen
            supabaseConfigured={Boolean(supabase)}
            authReady={authReady}
            authMode={authMode}
            onAuthModeChange={(mode) => { setAuthMode(mode); setNotice(""); }}
            email={email}
            onEmailChange={setEmail}
            password={password}
            onPasswordChange={setPassword}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            showPassword={showPassword}
            onToggleShowPassword={() => setShowPassword((value) => !value)}
            busy={busy}
            notice={notice}
            onSubmit={(event) => void handleAuth(event)}
          />
        ) : (<>
          <Sidebar activeTab={activeTab} gastosView={gastosView} onNavigate={navigate} userName={userDisplayName} userEmail={session?.user.email} open={drawerOpen} onOpenChange={setDrawerOpen} />
          <div className="app-main">
          <MobileHeader
            title={screenTitle(activeTab, gastosView)}
            subtitle={activeTab === "inicio" ? `${greeting}${firstName ? ", " + firstName : ""}` : undefined}
            description={screenDescription(activeTab, gastosView)}
            alertsLabel={`Radar e notificações: ${alerts.length} alertas`}
            hasActiveAlerts={enabledAlerts > 0}
            balancesHidden={balancesHidden}
            onToggleBalances={() => setBalancesHidden((hidden) => !hidden)}
            onOpenAlerts={() => goTo("patrimonio", { anchor: "patrimonio-radar" })}
            onQuickAdd={() => { setQuickEntryStep("choose"); setQuickEntryOpen(true); }}
            menuOpen={drawerOpen}
            onOpenMenu={() => setDrawerOpen(true)}
          />
          <section className="dashboard" aria-labelledby="screen-title">
            {activeTab === "inicio" && <DashboardOverview
              loading={!dataLoaded}
              balancesHidden={balancesHidden}
              currentDate={currentBudgetDate}
              accounts={accounts}
              accountBalances={accountBalances}
              cards={cards}
              cardCommittedAmounts={cardCommittedAmounts}
              transactions={transactions}
              categories={categories}
              goals={goals}
              budgets={budgets}
              budgetSpend={budgetSpend}
              onOpenBudgets={() => goTo("gastos", { view: "planejar" })}
              investedBrl={investedBrl}
              investedUsd={investedUsd}
              onNewTransaction={openTransactionForm}
              onOpenTransactions={() => goTo("gastos", { view: "lancamentos" })}
              onOpenAccounts={() => goTo("gastos", { view: "contas" })}
              onOpenInvestments={() => goTo("patrimonio")}
              onOpenGoals={() => goTo("planejamento")}
              onOpenReports={() => goTo("relatorios")}
            />}
            <section className="panel privacy-panel" hidden={activeTab !== "conta"} id="conta" aria-labelledby="privacy-title">
              <div className="panel-heading"><div><span className="principles-label">Privacidade e controle</span><h2 id="privacy-title">Seus dados e sua conta</h2><p>Exporte uma cópia dos seus dados ou solicite a exclusão permanente da conta e dos comprovantes privados.</p></div></div>
              <div className="account-profile-card">
                <span className="account-avatar">{(profile?.display_name || session?.user.email || "GV").split(/\s+/).map((part) => part[0]).join("").slice(0,2).toUpperCase()}</span>
                <span><strong>{profile?.display_name || "Minha conta"}</strong><small>{session?.user.email}</small></span>
              </div>
              <div className="account-menu-list">
                <button type="button" onClick={() => goTo("gastos", { view: "conexoes" })}><span className="account-menu-icon green" aria-hidden="true"><Plug size={18} strokeWidth={1.75} /></span><span><strong>Conexões</strong><small>WhatsApp e notificações, quando configurados</small></span><ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>
                <button type="button" onClick={() => void toggleTheme()}><span className="account-menu-icon purple" aria-hidden="true"><Palette size={18} strokeWidth={1.75} /></span><span><strong>Personalização</strong><small>Tema {theme === "dark" ? "escuro" : "claro"} · tocar para trocar</small></span><ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>
                <button type="button" onClick={() => goTo("planejamento")}><span className="account-menu-icon blue" aria-hidden="true"><Target size={18} strokeWidth={1.75} /></span><span><strong>Metas e planejamento</strong><small>Objetivos e valores a receber</small></span><ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>
                <button type="button" onClick={() => goTo("relatorios")}><span className="account-menu-icon green" aria-hidden="true"><BarChart3 size={18} strokeWidth={1.75} /></span><span><strong>Relatórios</strong><small>Acompanhamento financeiro</small></span><ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>
              </div>
              {recoveryMode && <form className="finance-form recovery-form" onSubmit={(event) => void updatePassword(event)}><strong>Defina sua nova senha</strong><label>Nova senha<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label><button className="primary-button" type="submit" disabled={busy}>Salvar nova senha</button></form>}
              <nav className="section-jump" aria-label="Atalhos da área da conta"><a href="#conta-assistente">Assistente</a><a href="#conta-comprovante">Ler comprovante</a><a href="#conta-proximos-passos">Próximos recursos</a></nav>
              <details className="account-data-details">
                <summary>Dados, backup e privacidade</summary>
              <div className="privacy-actions">
                <button className="primary-button" type="button" onClick={() => void exportPersonalData()} disabled={busy}>Exportar meus dados (JSON)</button>
                <label>Para excluir, digite EXCLUIR_CONTA
                  <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} autoComplete="off" spellCheck={false} placeholder="EXCLUIR_CONTA" />
                </label>
                <button className="quiet-button danger-button" type="button" onClick={() => void deletePersonalAccount()} disabled={busy || deleteConfirmText !== "EXCLUIR_CONTA"}>Excluir minha conta permanentemente</button>
              </div>
              <p className="helper-text">A exportação inclui metadados dos comprovantes; os arquivos podem ser abertos individualmente no histórico. A exclusão exige autenticação recente (últimos 15 minutos), remove comprovantes do Storage e apaga os dados vinculados à conta. Essa ação não pode ser desfeita.</p>
              </details>
              <button className="account-signout-button" type="button" onClick={() => void handleSignOut()} disabled={busy}><LogOut size={18} strokeWidth={1.75} aria-hidden="true" /> Sair da conta</button>
            </section>
            <section className="panel" id="patrimonio" hidden={activeTab !== "patrimonio"} aria-labelledby="radar-title">
              <h2 id="radar-title" className="sr-only">Patrimônio e investimentos</h2>
              <FixedIncomeHub
                assets={investmentAssets}
                incomeEvents={incomeEvents}
                investmentSummary={investmentSummary}
                manualPriceInputs={manualPriceInputs}
                onManualPriceChange={(assetId, value) => setManualPriceInputs((current) => ({ ...current, [assetId]: value }))}
                onUpdateReference={(event, asset) => void updateManualInvestmentPrice(event, asset)}
                onAddTitle={openFixedIncomeForm}
                busy={busy}
              />
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
                {investmentAssets.length > 0 && <PortfolioAllocation assets={investmentAssets} investmentSummary={investmentSummary} />}
                <button className="quiet-button" type="button" onClick={openFixedIncomeForm}><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Cadastrar renda fixa</button>
                <details ref={investmentAssetDrawerRef} className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Adicionar ativo à carteira</summary><form className="finance-form" onSubmit={(event) => void createInvestmentAsset(event)}>
                  <label>{investmentClass === "fixed_income" ? "Identificação (opcional)" : "Ticker ou nome"}<input value={investmentSymbol} onChange={(event) => { const raw = event.target.value; const query = raw.trim(); const value = query.toUpperCase(); const matchEntry = Object.entries(INVESTMENT_CATALOG).find(([ticker]) => ticker === value); setInvestmentSymbol(matchEntry ? matchEntry[0] : raw); if (matchEntry) { const match = matchEntry[1]; setInvestmentName(match.name); setInvestmentClass(match.assetClass); setInvestmentCurrency("BRL"); } }} maxLength={120} autoComplete="off" placeholder={investmentClass === "fixed_income" ? "Ex.: CDB Banco X (opcional)" : "Digite PETR4, Petrobras, MXRF11..."} required={investmentClass !== "fixed_income"} /></label>{investmentSymbol.trim().length >= 2 && !Object.keys(INVESTMENT_CATALOG).includes(investmentSymbol.trim().toUpperCase()) && <ul className="investment-suggestions" aria-label="Sugestões de ativos">{Object.entries(INVESTMENT_CATALOG).filter(([ticker,item]) => { const query = investmentSymbol.trim().toLocaleLowerCase("pt-BR"); return ticker.toLocaleLowerCase("pt-BR").includes(query) || item.name.toLocaleLowerCase("pt-BR").includes(query); }).slice(0,6).map(([ticker,item]) => <li key={ticker}><button type="button" onClick={() => { setInvestmentSymbol(ticker); setInvestmentName(item.name); setInvestmentClass(item.assetClass); setInvestmentCurrency("BRL"); }}>{item.name}<small>{ticker}</small></button></li>)}</ul>}
                  <label>Nome do ativo<input value={investmentName} onChange={(event) => setInvestmentName(event.target.value)} maxLength={120} placeholder="Nome ou descrição" required /></label>
                  <label>Classe<select value={investmentClass} onChange={(event) => setInvestmentClass(event.target.value as InvestmentAssetRow["asset_class"])}><option value="stock">Ação</option><option value="fii">FII</option><option value="etf">ETF</option><option value="bdr">BDR</option><option value="fixed_income">Renda fixa</option><option value="crypto">Cripto</option></select></label>
                  <label>Moeda<select value={investmentCurrency} onChange={(event) => setInvestmentCurrency(event.target.value as "BRL" | "USD")}><option value="BRL">BRL</option><option value="USD">USD</option></select></label>
                  {investmentClass === "fixed_income" && <>
                    <label>Produto<select value={fixedIncomeProduct} onChange={(event) => setFixedIncomeProduct(event.target.value)}><option>CDB</option><option>LCI</option><option>LCA</option><option>Tesouro Selic</option><option>Tesouro IPCA+</option><option>Tesouro Prefixado</option><option>LC</option><option>CRI</option><option>CRA</option><option>Debênture</option><option>Poupança</option></select></label>
                    <label>Instituição emissora<input value={fixedIncomeIssuer} onChange={(event) => setFixedIncomeIssuer(event.target.value)} maxLength={100} placeholder="Ex.: Banco emissor"/></label>
                    <label>Indexador<select value={fixedIncomeIndexer} onChange={(event) => setFixedIncomeIndexer(event.target.value as typeof fixedIncomeIndexer)}><option value="CDI">CDI</option><option value="IPCA">IPCA</option><option value="SELIC">Selic</option><option value="PREFIXADO">Prefixado</option></select></label>
                    <label>{fixedIncomeIndexer === "CDI" ? "Percentual do CDI (%)" : fixedIncomeIndexer === "SELIC" ? "Percentual da Selic (%)" : fixedIncomeIndexer === "IPCA" ? "Taxa adicional ao IPCA (% a.a.)" : "Taxa prefixada (% a.a.)"}<input inputMode="decimal" value={fixedIncomeRate} onChange={(event) => setFixedIncomeRate(event.target.value)} placeholder={fixedIncomeIndexer === "CDI" || fixedIncomeIndexer === "SELIC" ? "Ex.: 100" : "Ex.: 12,5"} required/></label>
                    <label>Início da aplicação<input type="date" value={fixedIncomeStart} onChange={(event) => setFixedIncomeStart(event.target.value)} required/></label>
                    <label>Vencimento (se houver)<input type="date" min={fixedIncomeStart} value={fixedIncomeMaturity} onChange={(event) => setFixedIncomeMaturity(event.target.value)}/></label>
                    <label>Próxima data de rendimento (opcional)<input type="date" min={fixedIncomeStart} max={fixedIncomeMaturity || undefined} value={fixedIncomeNextYieldDate} onChange={(event) => setFixedIncomeNextYieldDate(event.target.value)}/></label>
                    <label>Periodicidade do rendimento<select value={fixedIncomeFrequency} onChange={(event) => setFixedIncomeFrequency(event.target.value as typeof fixedIncomeFrequency)}><option value="daily">Diário (dias úteis)</option><option value="monthly">Mensal</option><option value="semiannual">Semestral</option><option value="at_maturity">No vencimento</option></select></label>
                    <label>Liquidez<select value={fixedIncomeLiquidity} onChange={(event) => setFixedIncomeLiquidity(event.target.value as typeof fixedIncomeLiquidity)}><option value="unknown">Não informada</option><option value="daily">Diária</option><option value="at_maturity">Somente no vencimento</option><option value="grace_period">Após carência</option></select></label>
                    {fixedIncomeLiquidity === "grace_period" && <label>Carência (dias)<input inputMode="numeric" value={fixedIncomeGraceDays} onChange={(event) => setFixedIncomeGraceDays(event.target.value.replace(/[^0-9]/g, "").slice(0, 5))} placeholder="Ex.: 90" /></label>}
                  </>}
                  <button className="primary-button" type="submit" disabled={busy}>Adicionar ativo</button>
                </form></details>
                {investmentAssets.length > 0 && <details className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Registrar operação</summary><form className="finance-form" onSubmit={(event) => void createInvestmentOperation(event)}>
                  <label>Ativo<select value={investmentAssetId} onChange={(event) => { const id = event.target.value; setInvestmentAssetId(id); const selected = investmentAssets.find((asset) => asset.id === id); if (selected?.current_price != null) setInvestmentUnitPrice(decimalToBrlInput(selected.current_price)); }} required>{investmentAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}</select></label>
                  <label>Operação<select value={investmentOperationType} onChange={(event) => setInvestmentOperationType(event.target.value as "opening" | "buy" | "sell")}><option value="buy">Compra</option><option value="sell">Venda</option><option value="opening">Posição inicial</option></select></label>
                  <label>{investmentAssets.find((item) => item.id === investmentAssetId)?.asset_class === "fixed_income" ? "Quantidade de títulos/unidades" : "Quantidade de cotas"}<input inputMode="decimal" value={investmentQuantity} onChange={(event) => setInvestmentQuantity(event.target.value)} placeholder="Ex.: 10" required /></label>
                  <label>{investmentAssets.find((item) => item.id === investmentAssetId)?.asset_class === "fixed_income" ? "Preço unitário / PU" : "Preço por cota"} ({investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL"})<input inputMode="decimal" value={investmentUnitPrice} onChange={(event) => setInvestmentUnitPrice(event.target.value)} placeholder="Informe o preço de referência" required /></label>
                  <label>Taxas ({investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL"})<input inputMode="decimal" value={investmentFees} onChange={(event) => setInvestmentFees(event.target.value)} required /></label>
                  <label>Data<input type="date" value={investmentDate} onChange={(event) => setInvestmentDate(event.target.value)} required /></label>
                  <p className="investment-total-preview" aria-live="polite">Total estimado da operação: <strong>{(() => { const q = Number(normalizeInvestmentQuantity(investmentQuantity)?.atoms ?? 0n) / 100_000_000; const p = Number(parseBrlAmount(investmentUnitPrice) ?? Number.NaN); const f = Number(parseBrlAmount(investmentFees, { allowZero: true }) ?? 0); const total = q * p + (investmentOperationType === "sell" ? -f : f); return Number.isFinite(total) && q > 0 && p > 0 ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL" }).format(total) : "—"; })()}</strong></p>
                  <button className="primary-button" type="submit" disabled={busy}>Registrar operação</button>
                </form></details>}
                {investmentAssets.every((asset) => asset.asset_class === "fixed_income") ? <EmptyState compact>Adicione ações, FIIs, ETFs ou outros ativos para acompanhar também nesta carteira.</EmptyState> : <ul className="account-list">{investmentAssets.filter((asset) => asset.asset_class !== "fixed_income").map((asset) => {
                  const summary = investmentSummary(asset.id);
                  const receivedCents = incomeEvents.filter((item) => item.asset_id === asset.id && item.status === "received")
                    .reduce((total, item) => total + decimalToCents(item.received_amount), 0n);
                  return <li className="investment-asset-card" key={asset.id}><strong>{asset.symbol} · {asset.name}</strong><span>{{stock:"Ação",fii:"FII",etf:"ETF",bdr:"BDR",crypto:"Cripto",fixed_income:"Renda fixa"}[asset.asset_class]} · {asset.currency}</span><small>Quantidade: {summary.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} · Custo: {formatInvestmentCents(BigInt(summary.costBasisCents), asset.currency)} · Custo médio: {formatInvestmentCents(BigInt(summary.averageCostCents), asset.currency)}</small><small>Resultado realizado: {formatInvestmentCents(BigInt(summary.realizedProfitCents), asset.currency)}{summary.error ? ` · ${summary.error}` : ""}</small><small>Proventos recebidos: {formatInvestmentCents(receivedCents, asset.currency)}</small>{asset.current_price != null && asset.price_as_of ? <small>Preço de referência: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: asset.currency, minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(asset.current_price))} · Fonte: {asset.price_source === "brapi.dev" ? "brapi.dev" : asset.price_source === "manual" ? "informado manualmente" : "origem não identificada"}{asset.price_source === "brapi.dev" ? " · atraso de origem aproximado de 30 min" : " · não é cotação automática"}{asset.price_source === "brapi.dev" && Date.now() - Date.parse(asset.price_as_of) > 45 * 60_000 ? " · cotação possivelmente desatualizada" : ""} · registrado em {new Date(asset.price_as_of).toLocaleString("pt-BR")}</small> : <small>Sem preço de referência cadastrado.</small>}
                    <details className="investment-reference-details"><summary>Atualizar preço de referência manual</summary><form className="finance-form" onSubmit={(event) => void updateManualInvestmentPrice(event, asset)}>
                      <label>Preço informado ({asset.currency})<input inputMode="decimal" value={manualPriceInputs[asset.id] ?? ""} onChange={(event) => setManualPriceInputs((current) => ({ ...current, [asset.id]: event.target.value }))} placeholder="Ex.: 32,45" disabled={busy} /></label>
                      <button className="quiet-button" type="submit" disabled={busy || !(manualPriceInputs[asset.id] ?? "").trim()}>Salvar referência</button>
                    </form></details></li>;
                })}</ul>}
                <p className="helper-text">Preços informados manualmente são apenas referências e não alteram operações, saldos, custo médio ou resultado realizado, nem alimentam o Radar. Cotações automáticas da B3 permanecem desativadas até existir licença adequada. Cripto e renda fixa não têm feed automático.</p>
              </section>

              <section className="subpanel radar-panel" aria-labelledby="radar-alerts-title">
              <div className="transaction-heading" id="patrimonio-radar"><strong id="radar-alerts-title">Radar de preços</strong><span>{alerts.length} alertas cadastrados</span></div>
              <details className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Criar alerta de preço</summary><form className="radar-form" onSubmit={(event) => void createAlert(event)}>
                <label>Classe<select value={assetClass} onChange={(event) => setAssetClass(event.target.value as RadarAlert["asset_class"])}><option value="stock">Ação</option><option value="fii">FII</option><option value="etf">ETF</option><option value="bdr">BDR</option><option value="crypto">Cripto</option></select></label>
                <label>Ativo<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Ex.: PETR4" maxLength={32} required /></label>
                <label>Condição<select value={condition} onChange={(event) => setCondition(event.target.value as RadarAlert["condition_type"])}><option value="above">Preço acima de</option><option value="below">Preço abaixo de</option><option value="daily_drop">Queda no dia (%)</option></select></label>
                <label>{condition === "daily_drop" ? "Queda (%)" : "Valor (R$)"}<input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(condition === "daily_drop" ? event.target.value : formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Criar alerta</button>
              </form></details>
              {alerts.length === 0 ? <EmptyState compact>Você ainda não tem alertas cadastrados.</EmptyState> : (
                <ul className="alert-list">
                  {alerts.map((alert) => <li key={alert.id}>
                    <div><strong>{alert.symbol}</strong><span>{alert.asset_class.toUpperCase()} · {alert.condition_type === "above" ? "Acima de" : alert.condition_type === "below" ? "Abaixo de" : "Queda diária de"} {alert.condition_type === "daily_drop" ? `${Number(alert.threshold).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : formatBRL(alert.threshold)}</span><small>Geração {alert.generation} · {alert.is_enabled ? "Ativo" : "Pausado"}</small></div>
                    <div className="alert-actions">
                      <button className="quiet-button" type="button" disabled={busy} onClick={() => void changeAlert(alert, alert.is_enabled ? "desativar" : "ativar")}>{alert.is_enabled ? "Pausar" : "Reativar"}</button>
                      <button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void changeAlert(alert, "excluir")}>Excluir</button>
                    </div>
                  </li>)}
                </ul>
              )}
              <div className="radar-fire-history">
                <div className="transaction-heading"><strong>Últimos disparos</strong><span>{radarFires.length} registrados</span></div>
                {radarFires.length === 0 ? <EmptyState compact>Nenhum alerta foi disparado ainda. Os eventos serão registrados quando houver cotações recentes e uma condição for atingida.</EmptyState> : <ul className="account-list">{radarFires.slice(0, 20).map((fire) => {
                  const alertId = fire.alert_key.split(":")[0];
                  const alert = alerts.find((item) => item.id === alertId);
                  return <li key={fire.alert_key}><strong>{alert?.symbol ?? "Ativo"} · {alert?.condition_type === "daily_drop" ? "Queda diária" : alert?.condition_type === "above" ? "Preço acima" : "Preço abaixo"}</strong><span>Preço observado: {Number(fire.observed_price).toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</span><small>Fonte: {fire.source ?? "não informada"} · Cotação de {fire.quote_observed_at ? new Date(fire.quote_observed_at).toLocaleString("pt-BR") : "horário indisponível"} · Alerta registrado {new Date(fire.fired_at).toLocaleString("pt-BR")}</small></li>;
                })}</ul>}
              </div>
              </section>

              <section className="subpanel" id="patrimonio-proventos" aria-labelledby="income-events-title">
                <div className="transaction-heading"><strong id="income-events-title">Dividendos e proventos</strong><span>{incomeEvents.filter((item) => item.status === "received").length} recebidos</span></div>
                {investmentAssets.length === 0 ? <EmptyState compact>Cadastre um ativo para registrar dividendos, JCP e outros proventos.</EmptyState> : <>
                  <details className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Registrar provento</summary><form className="finance-form" onSubmit={(event) => void createIncomeEvent(event)}>
                    <label>Ativo<select value={incomeAssetId} onChange={(event) => setIncomeAssetId(event.target.value)} required>{investmentAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}</select></label>
                    <label>Tipo<select value={incomeEventType} onChange={(event) => setIncomeEventType(event.target.value as IncomeEventRow["event_type"])}><option value="dividend">Dividendo</option><option value="jcp">Juros sobre capital próprio</option><option value="distribution">Distribuição</option><option value="coupon">Cupom</option><option value="interest">Juros</option><option value="amortization">Amortização</option><option value="other">Outro</option></select></label>
                    <label>Valor (R$)<input inputMode="decimal" value={incomeAmount} onChange={(event) => setIncomeAmount(formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
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
                  return <li key={item.id}><strong>{asset?.symbol ?? "Ativo"} · {item.event_type.toUpperCase()}</strong><span>{formatInvestmentCents(decimalToCents(amount), asset?.currency ?? "BRL")} · {item.status === "received" ? (item.settlement_state === "settled" ? "Recebido · lançado no saldo" : "Recebido · sem conciliação") : item.status === "cancelled" ? "Cancelado" : item.status === "planned" ? "Previsto" : "Anunciado"}</span><small>Referência: {formatDateBR(item.reference_date)}{item.payment_date ? ` · Pagamento: ${formatDateBR(item.payment_date)}` : ""}</small></li>;
                })}</ul>}
                <div className="income-calendar"><strong>Próximos pagamentos</strong>{incomeEvents.filter((item) => item.payment_date && item.payment_date >= todayInBrazil() && ["announced","planned"].includes(item.status)).sort((a,b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? "")).slice(0,6).map((item) => { const asset = investmentAssets.find((entry) => entry.id === item.asset_id); return <div key={item.id}><span>{formatDateBR(item.payment_date)}</span><b>{asset?.symbol ?? "Ativo"}</b><strong>{formatInvestmentCents(decimalToCents(item.announced_amount), asset?.currency ?? "BRL")}</strong></div>; })}{!incomeEvents.some((item) => item.payment_date && item.payment_date >= todayInBrazil() && ["announced","planned"].includes(item.status)) && <EmptyState compact>Nenhum pagamento futuro cadastrado.</EmptyState>}</div>
                <p className="helper-text">Os valores são lançados manualmente e não são previsões automáticas de mercado. Somente itens marcados como recebidos entram no total recebido; o histórico não altera automaticamente o saldo da conta.</p>
              </section>
            </section>

            <section className="panel planning-panel" id="planejamento" hidden={activeTab !== "planejamento"} aria-labelledby="planning-title">
              <h2 id="planning-title" className="sr-only">Metas e planejamento</h2>
              {signedIn && supabase && session && <ReceivablesPanel client={supabase} userId={session.user.id} accounts={accounts} onNotice={setNotice} onLedgerChange={requestLedgerRefresh} />}
                            <section className="planning-content" id="planejamento-metas" aria-labelledby="goals-title">
                <div className="transaction-heading"><strong id="goals-title">Metas financeiras</strong><span>{goals.length} cadastradas</span></div>
                <details className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Criar nova meta</summary><form className="finance-form" onSubmit={(event) => void createGoal(event)}>
                  <label>Nome da meta<input value={goalName} onChange={(event) => setGoalName(event.target.value)} maxLength={100} placeholder="Ex.: Reserva de emergência" required /></label>
                  <label>Valor desejado (R$)<input inputMode="decimal" value={goalTarget} onChange={(event) => setGoalTarget(formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
                  <label>Contribuição mensal planejada (R$)<input inputMode="decimal" value={goalMonthly} onChange={(event) => setGoalMonthly(formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
                  <label>Mês desejado (opcional)<input type="month" value={goalTargetMonth} onChange={(event) => setGoalTargetMonth(event.target.value)} /></label>
                  <button className="primary-button" type="submit" disabled={busy}>Criar meta</button>
                </form></details>
                {goals.length === 0 ? <EmptyState compact>Crie uma meta e registre contribuições para acompanhar sua evolução.</EmptyState> : <ul className="account-list">{goals.map((goal) => {
                  const current = decimalToCents(goal.current_amount);
                  const target = decimalToCents(goal.target_amount);
                  const reached = current >= target;
                  return <li key={goal.id}>
                    <strong>{goal.name}</strong>
                    <span>{formatCents(current)} de {formatCents(target)}</span>
                    <GoalProgress mode="goal" current={Number(current)} target={Number(target)} monthly={Number(decimalToCents(goal.monthly_contribution))} today={currentBudgetDate} label={`Progresso da meta ${goal.name}`} format={(cents) => formatCents(BigInt(Math.round(cents)))} />
                    <small>{[reached ? "" : goal.target_month ? `Prazo: ${new Date(`${goal.target_month}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}` : "", `Planejado por mês: ${formatCents(decimalToCents(goal.monthly_contribution))}`].filter(Boolean).join(" · ")}</small>
                    {goalContributions.some((item) => item.goal_id === goal.id) && <div className="goal-contribution-history"><small>Últimas contribuições</small>{goalContributions.filter((item) => item.goal_id === goal.id).slice(0, 5).map((item) => <small key={item.id}>{formatDateBR(item.contribution_date)} · {formatCents(decimalToCents(item.amount))}</small>)}</div>}
                    <details className="management-drawer goal-contribution-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Registrar contribuição</summary><form className="finance-form" onSubmit={(event) => { event.preventDefault(); void contributeToGoal(goal); }}>
                      <label>Adicionar contribuição (R$)<input inputMode="decimal" value={goalContributionAmounts[goal.id] ?? ""} onChange={(event) => setGoalContributionAmounts((currentAmounts) => ({ ...currentAmounts, [goal.id]: formatBrlInput(event.target.value) }))} placeholder="0,00" required /></label>
                      <button className="primary-button" type="submit" disabled={busy}>Registrar contribuição</button>
                    </form></details>
                  </li>;
                })}</ul>}
                <p className="helper-text">As contribuições são registradas em histórico e atualizam o total de forma atômica. O valor planejado mensal não é contabilizado como dinheiro guardado.</p>
              </section>
            </section>
            <section className="panel" id="gastos" hidden={activeTab !== "gastos"} aria-labelledby="accounts-title">
              <h2 id="accounts-title" className="sr-only">Gastos: lançamentos, contas, cartões e orçamentos</h2>
              <div className="segmented" role="tablist" aria-label="Seções de gastos">{GASTOS_VIEWS.map((view) => <button key={view.id} type="button" role="tab" aria-selected={gastosView === view.id} className={gastosView === view.id ? "active" : ""} onClick={() => setGastosView(view.id)}>{view.label}</button>)}</div>
              <div className="area-summary" hidden={gastosView !== "lancamentos"} aria-label="Resumo da área de gastos">
                <article><span>Contas</span><strong>{accounts.length}</strong><small>cadastradas</small></article>
                <article><span>Cartões</span><strong>{cards.length}</strong><small>cadastrados</small></article>
                <article><span>Despesas realizadas no mês</span><strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transactions.filter((item) => item.kind === "expense" && item.status === "paid" && item.transaction_date.startsWith(currentBudgetDate.slice(0, 7))).reduce((sum, item) => sum + Number(item.amount), 0))}</strong><small>com base nos lançamentos carregados</small></article>
              </div>
              <section className="expense-overview" hidden={gastosView !== "lancamentos"} aria-label="Resumo de despesas do mês">
                <div className="transaction-heading"><strong>Gastos por categoria</strong><span>Despesas realizadas</span></div>
                {(() => {
                  const rows = expensesByCategory(transactions, categories, currentBudgetDate.slice(0, 7));
                  const total = rows.reduce((sum,item) => sum+item.amount,0);
                  const currency = (value: number, compact = false) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",...(compact ? {notation:"compact" as const,maximumFractionDigits:1} : {})}).format(value);
                  return total > 0 ? <div className="expense-chart-row"><DonutChart label={"Total de gastos " + currency(total)} centerValue={currency(total, true)} centerCaption="Total" segments={rows.map((item,index) => ({ key: item.id, value: item.amount, color: CHART_PALETTE[index%CHART_PALETTE.length] }))} /><ul className="expense-legend">{rows.map((item,index) => <li key={item.id}><i style={{background:CHART_PALETTE[index%CHART_PALETTE.length]}}/><span>{item.name}</span><strong>{Math.round(item.amount/total*100)}%</strong></li>)}</ul></div> : <EmptyState compact>As categorias aparecerão aqui quando houver despesas realizadas neste mês.</EmptyState>;
                })()}
              </section>
              
<section className="subpanel finance-management" hidden={gastosView !== "contas"} id="gastos-contas" aria-labelledby="my-accounts-title">
 <div className="transaction-heading finance-section-heading"><div><strong id="my-accounts-title">Minhas contas</strong><span className="management-caption">{accounts.length} contas ativas</span></div><strong className="management-total">{balancesHidden?"••••••":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(accounts.reduce((sum,item)=>sum+(accountBalances[item.id]??Number(item.opening_balance)),0))}</strong></div>
 <details ref={accountDrawerRef} className="management-drawer"><summary>{editingAccountId?<><Pencil size={18} strokeWidth={1.75} aria-hidden="true" /> Editar conta</>:<><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Adicionar conta</>}</summary><form className="finance-form" onSubmit={(event)=>void createAccount(event)}>
  <label>Nome da conta<input value={accountName} onChange={(event)=>setAccountName(event.target.value)} maxLength={100} placeholder="Ex.: Conta principal" required/></label>
  <label>Banco ou instituição<select value={accountInstitutionKey} onChange={(event)=>setAccountInstitutionKey(event.target.value)}><option value="">Selecione o banco (opcional)</option>{BANK_CATALOG.map((bank)=><option key={bank.logoKey} value={bank.logoKey}>{bank.name}{bank.code?" · "+bank.code:""}</option>)}</select></label>
  {accountInstitutionKey&&(()=>{const bank=findBank(accountInstitutionKey);return bank?<div className="bank-selected"><img className="bank-logo brand-tile" src={bank.logoPath} alt="" aria-hidden="true"/><strong>{bank.name}</strong></div>:null;})()}
  <label>Tipo<select value={accountType} onChange={(event)=>setAccountType(event.target.value)}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="investment">Investimentos</option><option value="other">Outra</option></select></label>
  <label>Saldo inicial (R$)<input inputMode="decimal" value={openingBalance} onChange={(event)=>setOpeningBalance(formatBrlInput(event.target.value))} placeholder="0,00" required/></label>
  <div className="management-form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy?"Salvando…":editingAccountId?"Salvar alterações":"Adicionar conta"}</button>{editingAccountId&&<button className="quiet-button" type="button" onClick={()=>{setEditingAccountId(null);setAccountName("");setAccountInstitutionKey("");setOpeningBalance("0,00");if(accountDrawerRef.current)accountDrawerRef.current.open=false;}}>Cancelar</button>}</div>
 </form></details>
 {accounts.length===0?<EmptyState compact>Cadastre sua primeira conta para começar.</EmptyState>:<div className="finance-card-grid">{accounts.map((account)=>{const bank=findBank(account.institution_logo_key)??findBankByCode(account.institution_code);return <article className="finance-account-card" key={account.id}>
  <div className="finance-card-top"><span className="finance-card-icon" aria-hidden="true">{bank?.logoPath ? <img className="brand-tile" src={bank.logoPath} alt="" /> : account.account_type === "cash" ? <Banknote size={20} strokeWidth={1.75} /> : account.account_type === "investment" ? <TrendingUp size={20} strokeWidth={1.75} /> : account.account_type === "savings" ? <Wallet size={20} strokeWidth={1.75} /> : <Landmark size={20} strokeWidth={1.75} />}</span><span className={account.is_primary?"finance-primary-tag":"finance-muted-tag"}>{account.is_primary?"Principal":account.account_type==="savings"?"Poupança":account.account_type==="cash"?"Dinheiro":account.account_type==="investment"?"Investimentos":"Conta"}</span></div>
  <strong>{account.name}</strong><small className="finance-card-institution">{bank?.name||account.institution_name||"Instituição não informada"}</small><span className="finance-card-label">Saldo atual</span>
  <b className="finance-card-balance">{balancesHidden?"••••••":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(accountBalances[account.id]??Number(account.opening_balance))}</b>
  <div className="finance-card-actions"><button className="quiet-button" type="button" disabled={busy} onClick={()=>beginAccountEdit(account)}>Editar</button><button className="quiet-button danger-button" type="button" disabled={busy} onClick={()=>void archiveAccount(account)}>Excluir</button></div>
 </article>;})}</div>}
</section>

<section className="subpanel finance-management" hidden={gastosView !== "contas"} id="gastos-cartoes" aria-labelledby="cards-title">
 <div className="transaction-heading finance-section-heading"><div><strong id="cards-title">Meus cartões</strong><span className="management-caption">{cards.length} cartões ativos</span></div><strong className="management-total">{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cards.reduce((sum,item)=>sum+Number(item.credit_limit),0))} em limites</strong></div>
 <details ref={cardDrawerRef} className="management-drawer"><summary>{editingCardId?<><Pencil size={18} strokeWidth={1.75} aria-hidden="true" /> Editar cartão</>:<><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Adicionar cartão</>}</summary><form className="finance-form" onSubmit={(event)=>void createCard(event)}>
  <label>Nome do cartão<input value={cardName} onChange={(event)=>setCardName(event.target.value)} maxLength={100} placeholder="Ex.: Cartão principal" required/></label><label>Instituição<input value={cardInstitution} onChange={(event)=>setCardInstitution(event.target.value)} maxLength={120} placeholder="Banco ou instituição" required/></label>
  <label>Últimos 4 dígitos<input inputMode="numeric" autoComplete="off" value={cardLastFour} onChange={(event)=>setCardLastFour(event.target.value.replace(/\D/g,"").slice(0,4))} pattern="[0-9]{4}" maxLength={4} required/></label>
  <label>Limite (R$)<input inputMode="decimal" value={cardLimit} onChange={(event)=>setCardLimit(formatBrlInput(event.target.value))} required/></label><label>Fechamento<input type="number" min="1" max="31" value={cardClosingDay} onChange={(event)=>setCardClosingDay(event.target.value)} required/></label><label>Vencimento<input type="number" min="1" max="31" value={cardDueDay} onChange={(event)=>setCardDueDay(event.target.value)} required/></label>
  <div className="management-form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy?"Salvando…":editingCardId?"Salvar alterações":"Adicionar cartão"}</button>{editingCardId&&<button className="quiet-button" type="button" onClick={()=>{setEditingCardId(null);setCardName("");setCardInstitution("");setCardLastFour("");setCardLimit("0,00");setCardClosingDay("10");setCardDueDay("17");if(cardDrawerRef.current)cardDrawerRef.current.open=false;}}>Cancelar</button>}</div>
 </form></details>
 {cards.length===0?<EmptyState compact>Nenhum cartão cadastrado.</EmptyState>:<div className="finance-card-grid">{cards.map((card)=>{const used=cardCommittedAmounts[card.id]??0,total=Number(card.credit_limit),available=Math.max(0,total-used);return <article className="finance-credit-card" key={card.id}>
  <div className="finance-card-top"><span className="finance-card-icon" aria-hidden="true">{(()=>{const issuer=findBankByName(card.institution_name)??findBankByName(card.name);return issuer?<img className="brand-tile" src={issuer.logoPath} alt="" />:<CreditCard size={20} strokeWidth={1.75} />;})()}</span><span className="finance-muted-tag">{card.brand||"Crédito"}</span></div><strong>{card.name}</strong><small className="finance-card-institution">{card.institution_name} · final {card.last_four}</small>
  <span className="finance-card-label">Limite disponível</span><b className="finance-card-balance">{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(available)}</b>
  <ProgressBar className="finance-limit-track" value={total>0?Math.min(100,used/total*100):0} label={`Limite usado do cartão ${card.name}`} tone={total>0&&used/total>=0.9?"negative":total>0&&used/total>=0.7?"warning":"accent"} /><div className="finance-card-meta"><span>Usado {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(used)}</span><span>Total {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(total)}</span></div><small className="finance-card-institution">Fecha dia {card.closing_day} · Vence dia {card.due_day}</small>
  <div className="finance-card-actions"><button className="quiet-button" type="button" disabled={busy} onClick={()=>beginCardEdit(card)}>Editar</button><button className="quiet-button danger-button" type="button" disabled={busy} onClick={()=>void archiveCard(card)}>Excluir</button></div>
 </article>;})}</div>}
                <div className="transaction-heading"><strong>Pagamento de fatura</strong><span>Pagamentos totais ou parciais</span></div>
                <details className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Registrar pagamento de fatura</summary><form className="finance-form" onSubmit={(event) => void registerInvoicePayment(event)}>
                  <label>Cartão<select value={invoicePaymentCardId} onChange={(event) => setInvoicePaymentCardId(event.target.value)} required><option value="">Selecione</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · final {card.last_four}</option>)}</select></label>
                  <label>Data de fechamento da fatura<input type="date" value={invoiceClosingDate} onChange={(event) => setInvoiceClosingDate(event.target.value)} required /></label>
                  <label>Conta usada no pagamento<select value={invoicePaymentAccountId} onChange={(event) => setInvoicePaymentAccountId(event.target.value)} required><option value="">Selecione</option>{accounts.filter((account) => account.account_type !== "investment").map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label>Valor pago (R$)<input inputMode="decimal" value={invoicePaymentAmount} onChange={(event) => setInvoicePaymentAmount(formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
                  <label>Data do pagamento<input type="date" max={todayInBrazil()} value={invoicePaymentDate} onChange={(event) => setInvoicePaymentDate(event.target.value)} required /></label>
                  <button className="primary-button" type="submit" disabled={busy || !cards.length || !accounts.some((account) => account.account_type !== "investment")}>Registrar pagamento</button>
                </form></details>
                <p className="helper-text">O pagamento reduz o saldo da conta escolhida e libera o limite correspondente. Não cria uma segunda despesa nos relatórios: as compras já foram contabilizadas no cartão.</p>
                {invoicePayments.length > 0 && <ul className="account-list invoice-payment-list">{invoicePayments.slice(0,8).map((payment) => {
                  const card = cards.find((item) => item.id === payment.card_id);
                  const account = accounts.find((item) => item.id === payment.account_id);
                  return <li key={payment.id}><strong>{card?.name ?? "Cartão"} · fatura fechada em {formatDateBR(payment.invoice_closing_date)}</strong><span>{formatBRL(payment.amount)} · pago em {formatDateBR(payment.payment_date)}</span><small>Pago pela conta {account?.name ?? "arquivada"} <button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void deleteInvoicePayment(payment)}>Excluir pagamento</button></small></li>;
                })}</ul>}
              </section>
              <section className="subpanel" hidden={gastosView !== "planejar"} id="gastos-orcamentos" aria-labelledby="budgets-title">
                <div className="transaction-heading"><strong id="budgets-title">Orçamentos do mês</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${currentBudgetMonthStart}T12:00:00`))}</span></div>
                <details className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Definir orçamento</summary><form className="finance-form" onSubmit={(event) => void saveBudget(event)}>
                  <CategoryCombobox {...categoryPickerProps} label="Categoria" kind="expense" value={budgetCategoryId} onChange={setBudgetCategoryId} allowEmpty={false} required />
                  <label>Limite mensal (R$)<input inputMode="decimal" value={budgetLimit} onChange={(event) => setBudgetLimit(formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
                  <button className="primary-button" type="submit" disabled={busy || categories.every((category) => category.kind !== "expense")}>Definir ou atualizar limite</button>
                </form></details>
                {budgets.length === 0 ? <EmptyState compact>Defina limites para acompanhar os gastos por categoria neste mês.</EmptyState> : <ul className="account-list">{budgets.map((budget) => {
                  const category = categories.find((item) => item.id === budget.category_id);
                  const spent = budgetSpend.filter((item) => item.category_id === budget.category_id).reduce((total, item) => total + decimalToCents(item.settled_amount), 0n);
                  const limit = decimalToCents(budget.limit_amount);
                  const percent = limit > 0n ? Number((spent * 100n) / limit) : 0;
                  const exceeded = spent > limit;
                  return <li key={budget.id} className="budget-row"><strong className="budget-row-title">{category && <CategoryIcon category={category} size={28} />}{category?.name ?? "Categoria"}</strong><span>{formatCents(spent)} de {formatCents(limit)}</span><GoalProgress mode="budget" current={Number(spent)} target={Number(limit)} label={`Uso do orçamento de ${category?.name ?? "categoria"}`} format={(cents) => formatCents(BigInt(Math.round(cents)))} /><small>{exceeded ? "Limite ultrapassado" : percent > 80 ? "Perto do limite" : "Dentro do limite"}</small></li>;
                })}</ul>}
                <p className="helper-text">O gasto considera somente lançamentos de despesa com situação realizada e valor efetivamente liquidado no mês atual. Despesas previstas não entram no cálculo.</p>
              </section>
              <section className="subpanel" hidden={gastosView !== "conexoes"} id="gastos-integracoes" aria-labelledby="whatsapp-title">
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
              <section className="subpanel" hidden={gastosView !== "conexoes"} aria-labelledby="push-title">
                <div className="transaction-heading"><strong id="push-title">Notificações neste dispositivo</strong><span>{pushSubscriptions.length} inscrições na conta</span></div>
                <p className="helper-text">Ative para receber avisos quando o serviço de envio Push estiver configurado no backend. A permissão é solicitada pelo navegador.</p>
                <button className="primary-button" type="button" onClick={() => void togglePushNotifications()} disabled={busy}>
                  {pushSubscriptions.length > 0 ? "Gerenciar notificações deste dispositivo" : "Ativar notificações"}
                </button>
              </section>
              <section className="subpanel" hidden={gastosView !== "conexoes"} id="gastos-importacao" aria-labelledby="imports-title">
                <div className="transaction-heading"><strong id="imports-title">Importar extrato bancário</strong><span>CSV / OFX</span></div>
                <p className="helper-text">Selecione o destino e um arquivo de até 5 MB. A prévia identifica duplicados antes de criar lançamentos realizados.</p>
                <div className="finance-form">
                  <label>Destino<select value={importDestinationType} onChange={(event) => { const next = event.target.value as "account" | "card"; setImportDestinationType(next); setImportDestinationId(next === "account" ? accounts[0]?.id ?? "" : cards[0]?.id ?? ""); setImportPreview([]); }}><option value="account">Conta</option><option value="card">Cartão</option></select></label>
                  <label>{importDestinationType === "account" ? "Conta" : "Cartão"}<select value={importDestinationId} onChange={(event) => { setImportDestinationId(event.target.value); setImportPreview([]); }} required><option value="">Selecione</option>{(importDestinationType === "account" ? accounts : cards).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Arquivo CSV ou OFX<input type="file" accept=".csv,.ofx,text/csv,application/x-ofx" onChange={(event) => void previewStatementFile(event.target.files?.[0])} disabled={busy} /></label>
                </div>
                {importPreview.length > 0 && <>
                  <div className="transaction-heading"><strong>Prévia do extrato</strong><span>{importPreview.filter((row) => !row.duplicate).length} novos · {importPreview.filter((row) => row.duplicate).length} duplicados</span></div>
                  <ul className="account-list">{importPreview.slice(0, 30).map((row, index) => <li key={row.dedupeKey + index}><strong className="import-preview-title"><TransactionGlyph kind={row.kind} description={row.description} size={28} /><span>{row.description}</span></strong><span>{formatDateBR(row.date)} · {row.kind === "income" ? "Receita" : "Despesa"} · {formatCents(BigInt(row.amountCents))}</span><small>{row.duplicate ? "Já importado — será ignorado" : "Novo lançamento — será criado como realizado"}</small></li>)}</ul>
                  {importPreview.length > 30 && <p className="helper-text">Mostrando 30 de {importPreview.length} linhas; o lote completo será processado após sua confirmação.</p>}
                  <div className="alert-actions"><button className="primary-button" type="button" onClick={() => void confirmStatementImport()} disabled={busy || importPreview.every((row) => row.duplicate)}>Confirmar importação</button><button className="quiet-button" type="button" onClick={() => { setImportPreview([]); setImportFileName(""); setNotice("Prévia descartada."); }} disabled={busy}>Descartar prévia</button></div>
                </>}
              </section>
              
              
              
              <section className="subpanel" hidden={gastosView !== "planejar"} id="gastos-recorrencias" aria-labelledby="recurrences-title">
                <div className="transaction-heading"><strong id="recurrences-title">Recorrências</strong><span>{recurrences.filter((rule) => rule.is_active).length} ativas</span></div>
                <details className="management-drawer"><summary><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Criar recorrência</summary><form className="finance-form" onSubmit={(event) => void createRecurrence(event)}>
                  <label>Nome da regra<input value={recurrenceName} onChange={(event) => setRecurrenceName(event.target.value)} maxLength={100} placeholder="Ex.: Aluguel, salário, academia" required /></label>
                  <label>Tipo<select value={recurrenceKind} onChange={(event) => { const nextKind = event.target.value as "income" | "expense"; setRecurrenceKind(nextKind); setRecurrenceCategoryId(""); if (nextKind === "income") setRecurrenceCardId(""); }}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                  <label>Valor (R$)<input inputMode="decimal" value={recurrenceAmount} onChange={(event) => setRecurrenceAmount(formatBrlInput(event.target.value))} placeholder="0,00" required /></label>
                  <label>Frequência<select value={recurrenceFrequency} onChange={(event) => setRecurrenceFrequency(event.target.value as RecurrenceRow["frequency"])}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option><option value="interval">A cada intervalo de dias</option></select></label>
                  {recurrenceFrequency === "interval" && <label>Intervalo em dias<input type="number" min="1" max="366" value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)} required /></label>}
                  {recurrenceFrequency === "weekly" && <label>Dia da semana<select value={recurrenceWeekday} onChange={(event) => setRecurrenceWeekday(event.target.value)}>{["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"].map((day,index) => <option key={day} value={index}>{day}</option>)}</select></label>}
                  {(recurrenceFrequency === "monthly" || recurrenceFrequency === "yearly") && <label>Dia do mês<input type="number" min="1" max="31" value={recurrenceMonthDay} onChange={(event) => setRecurrenceMonthDay(event.target.value)} required /></label>}
                  {recurrenceFrequency === "yearly" && <label>Mês<select value={recurrenceMonth} onChange={(event) => setRecurrenceMonth(event.target.value)}>{["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((month,index) => <option key={month} value={index+1}>{month}</option>)}</select></label>}
                  <label>Começa em<input type="date" value={recurrenceStart} onChange={(event) => setRecurrenceStart(event.target.value)} required /></label>
                  <label>Termina em (opcional)<input type="date" min={recurrenceStart} value={recurrenceEnd} onChange={(event) => setRecurrenceEnd(event.target.value)} /></label>
                  <CategoryCombobox {...categoryPickerProps} label="Categoria" kind={recurrenceKind} value={recurrenceCategoryId} onChange={setRecurrenceCategoryId} />
                  <label>Conta<select value={recurrenceAccountId} onChange={(event) => { setRecurrenceAccountId(event.target.value); if (event.target.value) setRecurrenceCardId(""); }}><option value="">Não vinculada</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label>Cartão<select value={recurrenceCardId} onChange={(event) => { setRecurrenceCardId(event.target.value); if (event.target.value) setRecurrenceAccountId(""); }} disabled={recurrenceKind !== "expense"}><option value="">Não vincular cartão</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · final {card.last_four}</option>)}</select></label>
                  <button className="primary-button" type="submit" disabled={busy}>Criar recorrência</button>
                </form></details>
                {recurrences.length === 0 ? <EmptyState compact>Cadastre uma regra para acompanhar despesas e receitas periódicas.</EmptyState> : <ul className="account-list">{recurrences.map((rule) => <li key={rule.id}><strong>{rule.name} · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(rule.amount))}</strong><span>{rule.kind === "income" ? "Receita" : "Despesa"} · {({daily:"Diária",weekly:"Semanal",biweekly:"Quinzenal",monthly:"Mensal",yearly:"Anual",interval:"Por intervalo"})[rule.frequency]}</span><small>Próxima data: {new Date(`${rule.next_occurrence_on}T12:00:00`).toLocaleDateString("pt-BR")} · {rule.is_active ? "Ativa" : "Pausada"}<button className="quiet-button" type="button" disabled={busy} onClick={() => void toggleRecurrence(rule)}>{rule.is_active ? "Pausar" : "Reativar"}</button></small></li>)}</ul>}
                <p className="helper-text">A regra apenas programa a próxima ocorrência. A geração de lançamentos será ativada com o processamento idempotente da agenda, sem marcar valores como realizados.</p>
              </section>
              <section className="subpanel transactions-section" id="gastos-lancamentos" hidden={gastosView !== "lancamentos"} aria-labelledby="transactions-title">
              <div className="transactions-toolbar"><button type="button" className="primary-button" onClick={() => openTransactionForm("expense")}><Plus size={18} strokeWidth={1.75} aria-hidden="true" /> Novo lançamento</button></div>
              <div className="transaction-heading"><strong id="transactions-title">Lançamentos</strong><span>{Math.min(transactionLimit, transactions.length)} de {transactions.length}</span></div>
              {transactions.length === 0 ? <EmptyState icon={ReceiptText} title="Nenhum lançamento ainda">Seus lançamentos aparecerão aqui.</EmptyState> : <ul className="transaction-list">{transactions.slice(0, transactionLimit).map((item) => { const category = categories.find((entry) => entry.id === item.category_id); const expanded = expandedTransactionId === item.id || editingTransactionId === item.id; return <li key={item.id} className={expanded ? "is-expanded" : ""}><button type="button" className="transaction-main" aria-expanded={expanded} onClick={() => setExpandedTransactionId(expanded ? null : item.id)}><TransactionGlyph kind={item.kind} description={item.description} category={category} /><span className="transaction-text"><strong>{item.description}</strong><small>{item.kind === "transfer" ? `${accounts.find((account) => account.id === item.transfer_from_account_id)?.name ?? "Origem"} → ${accounts.find((account) => account.id === item.transfer_to_account_id)?.name ?? "Destino"}` : category?.name ?? (item.kind === "income" ? "Receita" : "Despesa")}{item.card_id ? " · cartão" : ""} · {formatDateBR(item.transaction_date)}</small></span><span className="transaction-amount"><strong className={item.kind === "income" ? "amount-income" : item.kind === "transfer" ? "amount-neutral" : "amount-expense"}>{item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}{formatBRL(item.amount)}</strong>{item.status !== "paid" && <small className={"badge status-pill " + (item.status === "planned" ? "badge-warning planned" : "badge-neutral cancelled")}>{item.status === "planned" ? "Previsto" : "Cancelado"}</small>}</span></button>{expanded && <div className="transaction-row-actions">{receiptFiles.some((file) => file.transaction_id === item.id) && <button className="quiet-button" type="button" disabled={busy} onClick={() => void openReceiptFile(item.id)}>Abrir comprovante</button>}<button className="quiet-button" type="button" disabled={busy} onClick={() => beginTransactionEdit(item)}>Editar</button><button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void deleteTransaction(item)}>Excluir</button></div>}{editingTransactionId === item.id && <form className="transaction-edit-form" onSubmit={(event) => { event.preventDefault(); void saveTransactionEdit(item); }}><label>Descrição<input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={240} required /></label><label>Valor (R$)<input inputMode="decimal" value={editAmount} onChange={(event) => setEditAmount(formatBrlInput(event.target.value))} required /></label><label>Data<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} required /></label><label>Situação<select value={editStatus} onChange={(event) => setEditStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label><button className="primary-button" type="submit" disabled={busy}>Salvar alterações</button><button className="quiet-button" type="button" disabled={busy} onClick={() => setEditingTransactionId(null)}>Cancelar</button></form>}</li>; })}</ul>}
              {transactions.length > transactionLimit && <button className="secondary-button load-more" type="button" onClick={() => setTransactionLimit((limit) => limit + TRANSACTION_PAGE_SIZE)}>Mostrar mais lançamentos</button>}
              </section>
            </section>


            <ReportsPanel hidden={activeTab !== "relatorios"} currentDate={currentBudgetDate} transactions={transactions} categories={categories} />
            <section className="panel" id="conta-assistente" hidden={activeTab !== "conta"} aria-labelledby="assistant-title">
              <span className="principles-label">Inteligência artificial com controle</span>
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
              <span className="principles-label">Leitura assistida</span>
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
                  <CategoryCombobox {...categoryPickerProps} label="Categoria" kind={receiptDraft.kind ?? "expense"} value={categories.find((category) => category.kind === (receiptDraft.kind ?? "expense") && category.name.toLowerCase() === (receiptDraft.category ?? "").trim().toLowerCase())?.id ?? ""} onChange={(id) => patchReceiptDraft("category", categories.find((category) => category.id === id)?.name ?? null)} />
                  <label>Forma de pagamento<input value={receiptDraft.payment_method ?? ""} onChange={(event) => patchReceiptDraft("payment_method", event.target.value || null)} maxLength={40} placeholder="Opcional" /></label>
                </div>}
                {receiptDraft.warnings.length > 0 && <ul>{receiptDraft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
                {receiptDraft.sufficient && <><label>Conta para registrar<select value={receiptAccountId} onChange={(event) => setReceiptAccountId(event.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>{receiptDraft.installment_count && receiptDraft.installment_count > 1 && <p>Parcelamento identificado ({receiptDraft.installment_count} vezes). O registro parcelado ainda não está habilitado neste fluxo.</p>}<button className="primary-button" type="button" disabled={busy || !receiptAccountId || Boolean(receiptDraft.installment_count && receiptDraft.installment_count > 1)} onClick={() => void confirmReceiptDraft()}>Confirmar e criar lançamento</button></>}
              </div>}
              <p className="muted-copy">A confirmação cria somente o lançamento. O comprovante original fica armazenado em área privada, vinculado ao lançamento e acessível somente à sua conta.</p>
            </section>

            <section className="panel coming-panel" id="conta-proximos-passos" hidden={activeTab !== "conta"}><span className="principles-label">Próximas conexões</span><h2>Seu financeiro em expansão</h2><p>As integrações externas dependem da configuração de cada serviço. Nenhuma automação ou notificação é ativada sem a autorização necessária.</p></section>
            {notice && <div className="toast" role="status" aria-live="polite"><span>{notice}</span><button type="button" className="icon-button" aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={16} strokeWidth={1.75} aria-hidden="true" /></button></div>}
          </section>

          </div>
          <QuickEntryModal open={quickEntryOpen} step={quickEntryStep} kind={txKind} form={transactionForm} onBack={() => setQuickEntryStep("choose")} onClose={() => setQuickEntryOpen(false)} onSelect={openTransactionForm} onOpenPlanning={() => { setQuickEntryOpen(false); goTo("planejamento"); }} />
        </>)}
      </div>
    </main>
  );
}