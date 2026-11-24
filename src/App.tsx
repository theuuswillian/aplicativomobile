import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { clearFinancialRecordsForUser } from "./lib/secure-storage";
import { generateOccurrences, type RecurrenceFrequency } from "./domain/recurrence";
import { calculateInvestmentSummary, type InvestmentOperation } from "./domain/investments";
import { parseCsvStatement, parseOfxStatement, planImportBatch, type ImportRow } from "./domain/imports";
type PushSubscriptionRow = { id: string; endpoint: string; user_agent: string | null };
type WhatsappLinkState = { phone: string; weekly_summary_enabled: boolean };
type RadarFireRow = { alert_key: string; fired_at: string; observed_price: string; source: string | null; quote_observed_at: string | null };

type Theme = "dark" | "light";
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
type AccountRow = { id: string; name: string; account_type: string; opening_balance: string; is_primary: boolean };
type CardRow = { id: string; name: string; institution_name: string; last_four: string; brand: string | null; credit_limit: string; closing_day: number; due_day: number; is_archived: boolean };
type CategoryRow = { id: string; name: string; kind: "income" | "expense"; color: string | null; icon: string | null };
type RecurrenceRow = { id: string; name: string; kind: "income" | "expense"; amount: string; frequency: RecurrenceFrequency; interval_count: number; weekday: number | null; month_day: number | null; month_of_year: number | null; starts_on: string; ends_on: string | null; next_occurrence_on: string; account_id: string | null; card_id: string | null; is_active: boolean };
type BudgetRow = { id: string; category_id: string; year: number; month: number; limit_amount: string };
type GoalRow = { id: string; name: string; target_amount: string; current_amount: string; monthly_contribution: string; target_month: string | null };
type GoalContributionRow = { id: string; goal_id: string; amount: string; contribution_date: string; source: string; created_at: string };
type InvestmentAssetRow = { id: string; symbol: string; name: string; asset_class: "stock" | "fii" | "etf" | "bdr" | "fixed_income" | "crypto"; currency: "BRL" | "USD" };
type InvestmentOperationRow = { id: string; asset_id: string; operation_type: "opening" | "buy" | "sell"; operation_date: string; quantity: string; unit_price: string; gross_amount: string; fees: string };
type IncomeEventRow = { id: string; asset_id: string; event_type: "dividend" | "jcp" | "distribution" | "coupon" | "interest" | "amortization" | "other"; reference_date: string; payment_date: string | null; announced_amount: string; received_amount: string; status: "announced" | "planned" | "received" | "cancelled" };
type BudgetSpendRow = { category_id: string | null; settled_amount: string };
type TransactionRow = { id: string; kind: "income" | "expense" | "transfer"; status: "paid" | "planned" | "cancelled"; amount: string; transaction_date: string; description: string; account_id: string | null };
type ImportPreviewRow = ImportRow & { dedupeKey: string; duplicate: boolean };
type ReceiptFileRow = { id: string; transaction_id: string; storage_path: string; mime_type: string; byte_size: number; created_at: string };
type ReceiptDraft = { sufficient: boolean; kind: "income" | "expense" | null; amount: string | null; date: string | null; description: string | null; category: string | null; payment_method: string | null; installment_count: number | null; card_last_four: string | null; confidence: number; warnings: string[] };
const THEME_STORAGE_KEY = "granaviva:theme:v1";

function getInitialTheme(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a operação.";
}

function todayInBrazil(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [recurrences, setRecurrences] = useState<RecurrenceRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalContributions, setGoalContributions] = useState<GoalContributionRow[]>([]);
  const [investmentAssets, setInvestmentAssets] = useState<InvestmentAssetRow[]>([]);
  const [investmentOperations, setInvestmentOperations] = useState<InvestmentOperationRow[]>([]);
  const [incomeEvents, setIncomeEvents] = useState<IncomeEventRow[]>([]);
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
  const [incomeStatus, setIncomeStatus] = useState<IncomeEventRow["status"]>("received");
  const [investmentSymbol, setInvestmentSymbol] = useState("");
  const [investmentName, setInvestmentName] = useState("");
  const [investmentClass, setInvestmentClass] = useState<InvestmentAssetRow["asset_class"]>("stock");
  const [investmentCurrency, setInvestmentCurrency] = useState<"BRL" | "USD">("BRL");
  const [investmentAssetId, setInvestmentAssetId] = useState("");
  const [investmentOperationType, setInvestmentOperationType] = useState<"opening" | "buy" | "sell">("buy");
  const [investmentQuantity, setInvestmentQuantity] = useState("");
  const [investmentUnitPrice, setInvestmentUnitPrice] = useState("");
  const [investmentFees, setInvestmentFees] = useState("0,00");
  const [investmentDate, setInvestmentDate] = useState(todayInBrazil);
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
  const [accountType, setAccountType] = useState("checking");
  const [openingBalance, setOpeningBalance] = useState("0,00");
  const [txDescription, setTxDescription] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txKind, setTxKind] = useState<"income" | "expense">("expense");
  const [txStatus, setTxStatus] = useState<"paid" | "planned">("paid");
  const [txDate, setTxDate] = useState(todayInBrazil);
  const [txAccountId, setTxAccountId] = useState("");
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
        setProfile(null); setAlerts([]); setRadarFires([]); setAccounts([]); setCards([]); setCategories([]); setRecurrences([]); setBudgets([]); setGoals([]); setGoalContributions([]); setInvestmentAssets([]); setInvestmentOperations([]); setIncomeEvents([]); setPushSubscriptions([]); setWhatsappLink(null); setWhatsappLinkCode(""); setWhatsappSummaryEnabled(false); setIncomeAssetId(""); setIncomeAmount(""); setIncomeReferenceDate(todayInBrazil()); setIncomePaymentDate(""); setInvestmentSymbol(""); setInvestmentName(""); setInvestmentAssetId(""); setInvestmentQuantity(""); setInvestmentUnitPrice(""); setInvestmentFees("0,00"); setInvestmentDate(todayInBrazil()); setGoalName(""); setGoalTarget(""); setGoalMonthly("0,00"); setGoalTargetMonth(""); setGoalContributionAmounts({}); setImportFormat("CSV"); setImportDestinationType("account"); setImportDestinationId(""); setImportFileName(""); setImportPreview([]); setBudgetSpend([]); setTransactions([]); setTxCategoryId(""); setBudgetCategoryId(""); setBudgetLimit(""); setRecurrenceCategoryId(""); setRecurrenceAccountId(""); setRecurrenceCardId(""); setRecurrenceName(""); setRecurrenceAmount(""); setRecurrenceEnd(""); setRecurrenceStart(todayInBrazil());
        setTxAccountId(""); setTxCardId(""); setReceiptAccountId(""); setEditingTransactionId(null);
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
        const [account, preferences, radar, radarFireRows, pushRows, whatsappRows, receiptFileRows, accountRows, transactionRows, cardRows, categoryRows, recurrenceRows, budgetRows, budgetSpendRows, goalRows, goalContributionRows, investmentAssetRows, investmentOperationRows, incomeEventRows] = await Promise.all([
          client.functions.invoke("minha-conta", { body: { action: "consultar" } }),
          client.functions.invoke("minhas-preferencias", { body: { action: "consultar" } }),
          client.functions.invoke("radar-alertas", { body: { action: "consultar" } }),
          client.functions.invoke("radar-alertas", { body: { action: "consultar_disparos" } }),
          client.functions.invoke("push-inscricoes", { body: { action: "consultar" } }),
          client.functions.invoke("whatsapp-vincular", { body: { action: "consultar" } }),
          client.from("receipt_files").select("id,transaction_id,storage_path,mime_type,byte_size,created_at").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(100),
          client.from("accounts").select("id,name,account_type,opening_balance,is_primary").eq("user_id", session.user.id).eq("is_archived", false).order("created_at", { ascending: true }),
          client.from("transactions").select("id,kind,status,amount,transaction_date,description,account_id").eq("user_id", session.user.id).order("transaction_date", { ascending: false }).limit(30),
          client.from("cards").select("id,name,institution_name,last_four,brand,credit_limit,closing_day,due_day,is_archived").eq("user_id", session.user.id).eq("is_archived", false).order("created_at", { ascending: true }),
          client.from("categories").select("id,name,kind,color,icon").eq("user_id", session.user.id).order("kind", { ascending: true }).order("name", { ascending: true }),
          client.from("recurrence_rules").select("id,name,kind,amount,frequency,interval_count,weekday,month_day,month_of_year,starts_on,ends_on,next_occurrence_on,account_id,card_id,is_active").eq("user_id", session.user.id).order("next_occurrence_on", { ascending: true }),
          client.from("budgets").select("id,category_id,year,month,limit_amount").eq("user_id", session.user.id).eq("year", currentBudgetYear).eq("month", currentBudgetMonth).order("created_at", { ascending: true }),
          client.from("transactions").select("category_id,settled_amount").eq("user_id", session.user.id).eq("kind", "expense").eq("status", "paid").gte("transaction_date", currentBudgetMonthStart).lt("transaction_date", nextBudgetMonthStart).limit(10000),
          client.from("goals").select("id,name,target_amount,current_amount,monthly_contribution,target_month").eq("user_id", session.user.id).order("created_at", { ascending: true }),
          client.from("goal_contributions").select("id,goal_id,amount,contribution_date,source,created_at").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(100),
          client.from("investment_assets").select("id,symbol,name,asset_class,currency").eq("user_id", session.user.id).order("symbol", { ascending: true }),
          client.from("investment_operations").select("id,asset_id,operation_type,operation_date,quantity,unit_price,gross_amount,fees").eq("user_id", session.user.id).in("operation_type", ["opening","buy","sell"]).order("operation_date", { ascending: true }),
          client.from("income_events").select("id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status").eq("user_id", session.user.id).order("reference_date", { ascending: false }),
        ]);
        if (account.error) throw account.error;
        if (preferences.error) throw preferences.error;
        if (radar.error) throw radar.error;
        if (radarFireRows.error) throw radarFireRows.error;
        if (pushRows.error) throw pushRows.error;
        if (whatsappRows.error) throw whatsappRows.error;
        if (receiptFileRows.error) throw receiptFileRows.error;
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
        setCategories((categoryRows.data ?? []) as CategoryRow[]);
        setRecurrences((recurrenceRows.data ?? []) as RecurrenceRow[]);
        setBudgets((budgetRows.data ?? []) as BudgetRow[]);
        setBudgetSpend((budgetSpendRows.data ?? []) as BudgetSpendRow[]);
        setGoals((goalRows.data ?? []) as GoalRow[]);
        setGoalContributions((goalContributionRows.data ?? []) as GoalContributionRow[]);
        setInvestmentAssets((investmentAssetRows.data ?? []) as InvestmentAssetRow[]);
        setInvestmentOperations((investmentOperationRows.data ?? []) as InvestmentOperationRow[]);
        setIncomeEvents((incomeEventRows.data ?? []) as IncomeEventRow[]);
        setPushSubscriptions((pushRows.data?.data ?? []) as PushSubscriptionRow[]);
        setWhatsappLink(whatsappRows.data?.data?.linked ? { phone: whatsappRows.data.data.phone, weekly_summary_enabled: whatsappRows.data.data.weekly_summary_enabled } : null);
        setWhatsappSummaryEnabled(Boolean(whatsappRows.data?.data?.weekly_summary_enabled));
        setReceiptFiles((receiptFileRows.data ?? []) as ReceiptFileRow[]);
        if (investmentAssetRows.data?.[0]?.id) setIncomeAssetId((current) => current || investmentAssetRows.data[0].id);
        if (investmentAssetRows.data?.[0]?.id) setInvestmentAssetId((current) => current || investmentAssetRows.data[0].id);
        setTransactions((transactionRows.data ?? []) as TransactionRow[]);
        if (accountRows.data?.[0]?.id) setTxAccountId((current) => current || accountRows.data[0].id);
        if (accountRows.data?.[0]?.id) setReceiptAccountId((current) => current || accountRows.data[0].id);
        if (accountRows.data?.[0]?.id) setImportDestinationId((current) => current || accountRows.data[0].id);
      } catch (error) {
        if (active) setNotice(errorMessage(error));
      }
    };
    void load();
    return () => { active = false; };
  }, [session]);

  const signedIn = Boolean(session?.user);
  const enabledAlerts = useMemo(() => alerts.filter((alert) => alert.is_enabled).length, [alerts]);

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
        opening_balance: amount, opening_balance_date: todayInBrazil(),
        is_primary: accounts.length === 0,
      }).select("id,name,account_type,opening_balance,is_primary").single();
      if (error) throw error;
      const created = data as AccountRow;
      setAccounts((current) => [...current, created]);
      setTxAccountId((current) => current || created.id);
      setReceiptAccountId((current) => current || created.id);
      setAccountName("");
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
          .insert(transactionInput).select("id,kind,status,amount,transaction_date,description,account_id").single();
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
    if (!investmentAssets.some((asset) => asset.id === incomeAssetId) || !amount || !incomeReferenceDate ||
        (incomePaymentDate && incomePaymentDate < incomeReferenceDate) ||
        (incomeStatus === "received" && !incomePaymentDate)) {
      setNotice("Confira o ativo, valor e datas. Proventos recebidos precisam ter data de pagamento.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("income_events").insert({
        user_id: session.user.id, asset_id: incomeAssetId, event_type: incomeEventType,
        reference_date: incomeReferenceDate, payment_date: incomePaymentDate || null,
        announced_amount: amount, received_amount: incomeStatus === "received" ? amount : "0.00",
        status: incomeStatus,
      }).select("id,asset_id,event_type,reference_date,payment_date,announced_amount,received_amount,status").single();
      if (error) throw error;
      setIncomeEvents((current) => [data as IncomeEventRow, ...current]);
      setIncomeAmount(""); setIncomePaymentDate("");
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
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("investment_assets").insert({
        user_id: session.user.id, symbol: symbolValue, name: nameValue,
        asset_class: investmentClass, currency: investmentCurrency,
      }).select("id,symbol,name,asset_class,currency").single();
      if (error) throw error;
      const created = data as InvestmentAssetRow;
      setInvestmentAssets((current) => [...current, created].sort((a,b) => a.symbol.localeCompare(b.symbol)));
      setInvestmentAssetId(created.id);
      setInvestmentSymbol(""); setInvestmentName("");
      setNotice("Ativo adicionado à carteira. A cotação ainda não está conectada.");
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

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(txAmount);
    if (!amount || !txDescription.trim() || (!txAccountId && !txCardId) || (txCardId && txKind !== "expense") || !txDate) {
      setNotice("Preencha descrição, valor, data e selecione uma conta ou cartão. Cartões são usados somente para despesas."); return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("transactions").insert({
        user_id: session.user.id, kind: txKind, status: txStatus, amount,
        transaction_date: txDate, description: txDescription.trim(),
        account_id: txCardId ? null : txAccountId, card_id: txCardId || null, category_id: txCategoryId || null, settled_amount: txStatus === "paid" ? amount : "0.00",
        settled_at: txStatus === "paid" ? txDate : null, source: "manual",
      }).select("id,kind,status,amount,transaction_date,description,account_id").single();
      if (error) throw error;
      setTransactions((current) => [data as TransactionRow, ...current].slice(0, 30));
      setTxDescription(""); setTxAmount(""); setTxCategoryId("");
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
        .select("id,kind,status,amount,transaction_date,description,account_id").single();
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
      }).select("id,kind,status,amount,transaction_date,description,account_id").single();
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
      setTransactions((current) => [data as TransactionRow, ...current].slice(0, 30));
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
    <main className="app-shell" data-theme={theme}>
      <div className="app-frame">
        <header className="topbar">
          <a className="brand" href="/" onClick={(event) => event.preventDefault()}>
            <span className="brand-mark" aria-hidden="true">G</span>
            <span>Grana<span className="brand-accent">Viva</span></span>
          </a>
          <div className="topbar-actions">
            {signedIn && <span className="account-chip">{profile?.display_name || session?.user.email}</span>}
            <button className="theme-toggle" type="button" aria-pressed={theme === "light"} onClick={() => void toggleTheme()}>
              <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
              <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
            </button>
            {signedIn && <button className="quiet-button" type="button" onClick={() => void handleSignOut()} disabled={busy}>Sair</button>}
          </div>
        </header>

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
            <div className="dashboard-heading">
              <div><span className="eyebrow"><span className="live-dot" /> ÁREA PESSOAL</span><h1 id="dashboard-title">Olá{profile?.display_name ? `, ${profile.display_name}` : ""}.</h1><p>Seus dados estão sincronizados com sua conta.</p></div>
              <div className="metric-card"><strong>{alerts.length}</strong><span>alertas no Radar</span><small>{enabledAlerts} ativos</small></div>
            </div>
            <section className="panel privacy-panel" aria-labelledby="privacy-title">
              <div className="panel-heading"><div><span className="principles-label">PRIVACIDADE E CONTROLE</span><h2 id="privacy-title">Seus dados e sua conta</h2><p>Exporte uma cópia dos seus dados ou solicite a exclusão permanente da conta e dos comprovantes privados.</p></div></div>
              <div className="privacy-actions">
                <button className="primary-button" type="button" onClick={() => void exportPersonalData()} disabled={busy}>Exportar meus dados (JSON)</button>
                <label>Para excluir, digite EXCLUIR_CONTA
                  <input value={deleteConfirmText} onChange={(event) => setDeleteConfirmText(event.target.value)} autoComplete="off" spellCheck={false} placeholder="EXCLUIR_CONTA" />
                </label>
                <button className="quiet-button danger-button" type="button" onClick={() => void deletePersonalAccount()} disabled={busy || deleteConfirmText !== "EXCLUIR_CONTA"}>Excluir minha conta permanentemente</button>
              </div>
              <p className="helper-text">A exportação inclui metadados dos comprovantes; os arquivos podem ser abertos individualmente no histórico. A exclusão exige autenticação recente (últimos 15 minutos), remove comprovantes do Storage e apaga os dados vinculados à conta. Essa ação não pode ser desfeita.</p>
            </section>
            <section className="panel" aria-labelledby="radar-title">
              <div className="panel-heading"><div><span className="principles-label">ACOMPANHAMENTO DE ATIVOS</span><h2 id="radar-title">Radar de preços</h2><p>Crie alertas para acompanhar seus ativos. O disparo usa somente cotações recentes de uma fonte validada; nenhuma fonte de preços está conectada ainda.</p></div></div>
              <form className="radar-form" onSubmit={(event) => void createAlert(event)}>
                <label>Classe<select value={assetClass} onChange={(event) => setAssetClass(event.target.value as RadarAlert["asset_class"])}><option value="stock">Ação</option><option value="fii">FII</option><option value="etf">ETF</option><option value="bdr">BDR</option><option value="crypto">Cripto</option></select></label>
                <label>Ativo<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Ex.: PETR4" maxLength={32} required /></label>
                <label>Condição<select value={condition} onChange={(event) => setCondition(event.target.value as RadarAlert["condition_type"])}><option value="above">Preço acima de</option><option value="below">Preço abaixo de</option><option value="daily_drop">Queda no dia (%)</option></select></label>
                <label>{condition === "daily_drop" ? "Queda (%)" : "Valor (R$)"}<input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="0,00" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Criar alerta</button>
              </form>
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
            </section>
            <section className="panel" aria-labelledby="accounts-title">
              <div className="panel-heading"><div><span className="principles-label">BASE FINANCEIRA</span><h2 id="accounts-title">Contas e lançamentos</h2><p>Cadastre suas contas e registre receitas e despesas. Valores previstos permanecem separados dos realizados.</p></div></div>
              <form className="finance-form" onSubmit={(event) => void createAccount(event)}>
                <label>Nome da conta<input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={100} placeholder="Ex.: Conta principal" required /></label>
                <label>Tipo<select value={accountType} onChange={(event) => setAccountType(event.target.value)}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="investment">Investimentos</option><option value="other">Outra</option></select></label>
                <label>Saldo inicial (R$)<input inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0,00" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Adicionar conta</button>
              </form>
              {accounts.length > 0 ? <ul className="account-list">{accounts.map((account) => <li key={account.id}><strong>{account.name}{account.is_primary ? " · Principal" : ""}</strong><span>{account.account_type}</span><small>Saldo inicial: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(account.opening_balance))}</small></li>)}</ul> : <p className="empty-state">Cadastre sua primeira conta para começar.</p>}
              <section className="subpanel" aria-labelledby="cards-title">
                <div className="transaction-heading"><strong id="cards-title">Cartões</strong><span>{cards.length} ativos</span></div>
                <form className="finance-form" onSubmit={(event) => void createCard(event)}>
                  <label>Nome do cartão<input value={cardName} onChange={(event) => setCardName(event.target.value)} maxLength={100} placeholder="Ex.: Cartão principal" required /></label>
                  <label>Instituição<input value={cardInstitution} onChange={(event) => setCardInstitution(event.target.value)} maxLength={120} placeholder="Banco ou instituição" required /></label>
                  <label>Últimos 4 dígitos<input inputMode="numeric" autoComplete="off" value={cardLastFour} onChange={(event) => setCardLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))} pattern="[0-9]{4}" maxLength={4} required /></label>
                  <label>Limite (R$)<input inputMode="decimal" value={cardLimit} onChange={(event) => setCardLimit(event.target.value)} required /></label>
                  <label>Fechamento<input type="number" min="1" max="31" value={cardClosingDay} onChange={(event) => setCardClosingDay(event.target.value)} required /></label>
                  <label>Vencimento<input type="number" min="1" max="31" value={cardDueDay} onChange={(event) => setCardDueDay(event.target.value)} required /></label>
                  <button className="primary-button" type="submit" disabled={busy}>Adicionar cartão</button>
                </form>
                {cards.length === 0 ? <p className="empty-state">Nenhum cartão cadastrado.</p> : <ul className="account-list">{cards.map((card) => <li key={card.id}><strong>{card.name} · final {card.last_four}</strong><span>{card.institution_name}</span><small>Limite: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(card.credit_limit))} · Fecha dia {card.closing_day} · Vence dia {card.due_day}<button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void archiveCard(card)}>Arquivar</button></small></li>)}</ul>}
              </section>
              <section className="subpanel" aria-labelledby="categories-title">
                <div className="transaction-heading"><strong id="categories-title">Categorias</strong><span>{categories.length} cadastradas</span></div>
                <form className="finance-form" onSubmit={(event) => void createCategory(event)}>
                  <label>Nome da categoria<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} placeholder="Ex.: Alimentação" required /></label>
                  <label>Tipo<select value={categoryKind} onChange={(event) => setCategoryKind(event.target.value as "income" | "expense")}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                  <button className="primary-button" type="submit" disabled={busy}>Criar categoria</button>
                </form>
                {categories.length === 0 ? <p className="empty-state">Crie categorias para organizar seus lançamentos.</p> : <ul className="category-list">{categories.map((category) => <li key={category.id}><span>{category.kind === "income" ? "Receita" : "Despesa"}</span><strong>{category.name}</strong></li>)}</ul>}
              </section>
              <section className="subpanel" aria-labelledby="budgets-title">
                <div className="transaction-heading"><strong id="budgets-title">Orçamentos do mês</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${currentBudgetMonthStart}T12:00:00`))}</span></div>
                <form className="finance-form" onSubmit={(event) => void saveBudget(event)}>
                  <label>Categoria<select value={budgetCategoryId} onChange={(event) => setBudgetCategoryId(event.target.value)} required><option value="">Selecione uma despesa</option>{categories.filter((category) => category.kind === "expense").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <label>Limite mensal (R$)<input inputMode="decimal" value={budgetLimit} onChange={(event) => setBudgetLimit(event.target.value)} placeholder="0,00" required /></label>
                  <button className="primary-button" type="submit" disabled={busy || categories.every((category) => category.kind !== "expense")}>Definir ou atualizar limite</button>
                </form>
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
              <section className="subpanel" aria-labelledby="whatsapp-title">
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
              <section className="subpanel" aria-labelledby="imports-title">
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
              <section className="subpanel" aria-labelledby="investments-title">
                <div className="transaction-heading"><strong id="investments-title">Carteira de investimentos</strong><span>{investmentAssets.length} ativos</span></div>
                <form className="finance-form" onSubmit={(event) => void createInvestmentAsset(event)}>
                  <label>Ticker<input value={investmentSymbol} onChange={(event) => setInvestmentSymbol(event.target.value.toUpperCase())} maxLength={32} placeholder="Ex.: PETR4" required /></label>
                  <label>Nome do ativo<input value={investmentName} onChange={(event) => setInvestmentName(event.target.value)} maxLength={120} placeholder="Nome ou descrição" required /></label>
                  <label>Classe<select value={investmentClass} onChange={(event) => setInvestmentClass(event.target.value as InvestmentAssetRow["asset_class"])}><option value="stock">Ação</option><option value="fii">FII</option><option value="etf">ETF</option><option value="bdr">BDR</option><option value="fixed_income">Renda fixa</option><option value="crypto">Cripto</option></select></label>
                  <label>Moeda<select value={investmentCurrency} onChange={(event) => setInvestmentCurrency(event.target.value as "BRL" | "USD")}><option value="BRL">BRL</option><option value="USD">USD</option></select></label>
                  <button className="primary-button" type="submit" disabled={busy}>Adicionar ativo</button>
                </form>
                {investmentAssets.length > 0 && <form className="finance-form" onSubmit={(event) => void createInvestmentOperation(event)}>
                  <label>Ativo<select value={investmentAssetId} onChange={(event) => setInvestmentAssetId(event.target.value)} required>{investmentAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}</select></label>
                  <label>Operação<select value={investmentOperationType} onChange={(event) => setInvestmentOperationType(event.target.value as "opening" | "buy" | "sell")}><option value="buy">Compra</option><option value="sell">Venda</option><option value="opening">Posição inicial</option></select></label>
                  <label>Quantidade<input inputMode="decimal" value={investmentQuantity} onChange={(event) => setInvestmentQuantity(event.target.value)} placeholder="Ex.: 10" required /></label>
                  <label>Preço unitário ({investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL"})<input inputMode="decimal" value={investmentUnitPrice} onChange={(event) => setInvestmentUnitPrice(event.target.value)} placeholder="0,00" required /></label>
                  <label>Taxas ({investmentAssets.find((item) => item.id === investmentAssetId)?.currency ?? "BRL"})<input inputMode="decimal" value={investmentFees} onChange={(event) => setInvestmentFees(event.target.value)} required /></label>
                  <label>Data<input type="date" value={investmentDate} onChange={(event) => setInvestmentDate(event.target.value)} required /></label>
                  <button className="primary-button" type="submit" disabled={busy}>Registrar operação</button>
                </form>}
                {investmentAssets.length === 0 ? <p className="empty-state">Adicione seus ativos e registre posições iniciais, compras e vendas.</p> : <ul className="account-list">{investmentAssets.map((asset) => {
                  const summary = investmentSummary(asset.id);
                  const receivedCents = incomeEvents.filter((item) => item.asset_id === asset.id && item.status === "received")
                    .reduce((total, item) => total + decimalToCents(item.received_amount), 0n);
                  return <li key={asset.id}><strong>{asset.symbol} · {asset.name}</strong><span>{asset.asset_class} · {asset.currency}</span><small>Quantidade: {summary.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} · Custo: {formatInvestmentCents(BigInt(summary.costBasisCents), asset.currency)} · Custo médio: {formatInvestmentCents(BigInt(summary.averageCostCents), asset.currency)}</small><small>Resultado realizado: {formatInvestmentCents(BigInt(summary.realizedProfitCents), asset.currency)}{summary.error ? ` · ${summary.error}` : ""}</small><small>Proventos recebidos: {formatInvestmentCents(receivedCents, asset.currency)}</small></li>;
                })}</ul>}
                <p className="helper-text">A carteira mostra posição e custo com base nas operações registradas. Não exibe preço de mercado nem rentabilidade atual enquanto não houver fonte de cotação validada e timestamp.</p>
              </section>
              <section className="subpanel" aria-labelledby="income-events-title">
                <div className="transaction-heading"><strong id="income-events-title">Dividendos e proventos</strong><span>{incomeEvents.filter((item) => item.status === "received").length} recebidos</span></div>
                {investmentAssets.length === 0 ? <p className="empty-state">Cadastre um ativo para registrar dividendos, JCP e outros proventos.</p> : <>
                  <form className="finance-form" onSubmit={(event) => void createIncomeEvent(event)}>
                    <label>Ativo<select value={incomeAssetId} onChange={(event) => setIncomeAssetId(event.target.value)} required>{investmentAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}</select></label>
                    <label>Tipo<select value={incomeEventType} onChange={(event) => setIncomeEventType(event.target.value as IncomeEventRow["event_type"])}><option value="dividend">Dividendo</option><option value="jcp">Juros sobre capital próprio</option><option value="distribution">Distribuição</option><option value="coupon">Cupom</option><option value="interest">Juros</option><option value="amortization">Amortização</option><option value="other">Outro</option></select></label>
                    <label>Valor (R$)<input inputMode="decimal" value={incomeAmount} onChange={(event) => setIncomeAmount(event.target.value)} placeholder="0,00" required /></label>
                    <label>Data de referência<input type="date" value={incomeReferenceDate} onChange={(event) => setIncomeReferenceDate(event.target.value)} required /></label>
                    <label>Data de pagamento<input type="date" min={incomeReferenceDate} value={incomePaymentDate} onChange={(event) => setIncomePaymentDate(event.target.value)} /></label>
                    <label>Situação<select value={incomeStatus} onChange={(event) => setIncomeStatus(event.target.value as IncomeEventRow["status"])}><option value="announced">Anunciado</option><option value="planned">Previsto</option><option value="received">Recebido</option><option value="cancelled">Cancelado</option></select></label>
                    <button className="primary-button" type="submit" disabled={busy}>Registrar provento</button>
                  </form>
                </>}
                {incomeEvents.length > 0 && <ul className="account-list">{incomeEvents.slice(0, 20).map((item) => {
                  const asset = investmentAssets.find((entry) => entry.id === item.asset_id);
                  const amount = item.status === "received" ? item.received_amount : item.announced_amount;
                  return <li key={item.id}><strong>{asset?.symbol ?? "Ativo"} · {item.event_type.toUpperCase()}</strong><span>{formatInvestmentCents(decimalToCents(amount), asset?.currency ?? "BRL")} · {item.status === "received" ? "Recebido" : item.status === "cancelled" ? "Cancelado" : item.status === "planned" ? "Previsto" : "Anunciado"}</span><small>Referência: {item.reference_date}{item.payment_date ? ` · Pagamento: ${item.payment_date}` : ""}</small></li>;
                })}</ul>}
                <p className="helper-text">Os valores são lançados manualmente e não são previsões automáticas de mercado. Somente itens marcados como recebidos entram no total recebido; o histórico não altera automaticamente o saldo da conta.</p>
              </section>
              <section className="subpanel" aria-labelledby="goals-title">
                <div className="transaction-heading"><strong id="goals-title">Metas financeiras</strong><span>{goals.length} cadastradas</span></div>
                <form className="finance-form" onSubmit={(event) => void createGoal(event)}>
                  <label>Nome da meta<input value={goalName} onChange={(event) => setGoalName(event.target.value)} maxLength={100} placeholder="Ex.: Reserva de emergência" required /></label>
                  <label>Valor desejado (R$)<input inputMode="decimal" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder="0,00" required /></label>
                  <label>Contribuição mensal planejada (R$)<input inputMode="decimal" value={goalMonthly} onChange={(event) => setGoalMonthly(event.target.value)} placeholder="0,00" required /></label>
                  <label>Mês desejado (opcional)<input type="month" value={goalTargetMonth} onChange={(event) => setGoalTargetMonth(event.target.value)} /></label>
                  <button className="primary-button" type="submit" disabled={busy}>Criar meta</button>
                </form>
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
                    <form className="finance-form" onSubmit={(event) => { event.preventDefault(); void contributeToGoal(goal); }}>
                      <label>Adicionar contribuição (R$)<input inputMode="decimal" value={goalContributionAmounts[goal.id] ?? ""} onChange={(event) => setGoalContributionAmounts((currentAmounts) => ({ ...currentAmounts, [goal.id]: event.target.value }))} placeholder="0,00" required /></label>
                      <button className="primary-button" type="submit" disabled={busy}>Registrar contribuição</button>
                    </form>
                  </li>;
                })}</ul>}
                <p className="helper-text">As contribuições são registradas em histórico e atualizam o total de forma atômica. O valor planejado mensal não é contabilizado como dinheiro guardado.</p>
              </section>
              <section className="subpanel" aria-labelledby="recurrences-title">
                <div className="transaction-heading"><strong id="recurrences-title">Recorrências</strong><span>{recurrences.filter((rule) => rule.is_active).length} ativas</span></div>
                <form className="finance-form" onSubmit={(event) => void createRecurrence(event)}>
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
                </form>
                {recurrences.length === 0 ? <p className="empty-state">Cadastre uma regra para acompanhar despesas e receitas periódicas.</p> : <ul className="account-list">{recurrences.map((rule) => <li key={rule.id}><strong>{rule.name} · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(rule.amount))}</strong><span>{rule.kind === "income" ? "Receita" : "Despesa"} · {({daily:"Diária",weekly:"Semanal",biweekly:"Quinzenal",monthly:"Mensal",yearly:"Anual",interval:"Por intervalo"})[rule.frequency]}</span><small>Próxima data: {new Date(`${rule.next_occurrence_on}T12:00:00`).toLocaleDateString("pt-BR")} · {rule.is_active ? "Ativa" : "Pausada"}<button className="quiet-button" type="button" disabled={busy} onClick={() => void toggleRecurrence(rule)}>{rule.is_active ? "Pausar" : "Reativar"}</button></small></li>)}</ul>}
                <p className="helper-text">A regra apenas programa a próxima ocorrência. A geração de lançamentos será ativada com o processamento idempotente da agenda, sem marcar valores como realizados.</p>
              </section>
              <form className="finance-form transaction-form" onSubmit={(event) => void createTransaction(event)}>
                <label>Tipo de lançamento<select value={txKind} onChange={(event) => { const nextKind = event.target.value as "income" | "expense"; setTxKind(nextKind); setTxCategoryId(""); if (nextKind === "income") setTxCardId(""); }}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                <label>Situação<select value={txStatus} onChange={(event) => setTxStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label>
                <label>Valor (R$)<input inputMode="decimal" value={txAmount} onChange={(event) => setTxAmount(event.target.value)} placeholder="0,00" required /></label>
                <label>Data<input type="date" value={txDate} onChange={(event) => setTxDate(event.target.value)} required /></label>
                <label>Conta<select value={txAccountId} onChange={(event) => { setTxAccountId(event.target.value); if (event.target.value) setTxCardId(""); }}><option value="">Não usar conta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                <label>Cartão<select value={txCardId} onChange={(event) => { setTxCardId(event.target.value); if (event.target.value) setTxAccountId(""); }}><option value="">Não usar cartão</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · final {card.last_four}</option>)}</select></label>
                <label>Categoria<select value={txCategoryId} onChange={(event) => setTxCategoryId(event.target.value)}><option value="">Sem categoria</option>{categories.filter((category) => category.kind === txKind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label className="wide-field">Descrição<input value={txDescription} onChange={(event) => setTxDescription(event.target.value)} maxLength={240} placeholder="Ex.: Mercado" required /></label>
                <button className="primary-button" type="submit" disabled={busy || accounts.length === 0}>Salvar lançamento</button>
              </form>
              <div className="transaction-heading"><strong>Últimos lançamentos</strong><span>Até 30 registros</span></div>
              {transactions.length === 0 ? <p className="empty-state">Seus lançamentos aparecerão aqui.</p> : <ul className="transaction-list">{transactions.map((item) => <li key={item.id}><div className="transaction-main"><div><strong>{item.description}</strong><span>{item.kind === "income" ? "Receita" : item.kind === "expense" ? "Despesa" : "Transferência"} · {item.status === "paid" ? "Realizado" : item.status === "planned" ? "Previsto" : "Cancelado"}</span><small>{new Date(item.transaction_date + "T12:00:00").toLocaleDateString("pt-BR")}</small></div><strong className={item.kind === "income" ? "income-value" : "expense-value"}>{item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.amount))}</strong></div><div className="transaction-row-actions">{receiptFiles.some((file) => file.transaction_id === item.id) && <button className="quiet-button" type="button" disabled={busy} onClick={() => void openReceiptFile(item.id)}>Abrir comprovante</button>}<button className="quiet-button" type="button" disabled={busy} onClick={() => beginTransactionEdit(item)}>Editar</button><button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void deleteTransaction(item)}>Excluir</button></div>{editingTransactionId === item.id && <form className="transaction-edit-form" onSubmit={(event) => { event.preventDefault(); void saveTransactionEdit(item); }}><label>Descrição<input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={240} required /></label><label>Valor (R$)<input inputMode="decimal" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} required /></label><label>Data<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} required /></label><label>Situação<select value={editStatus} onChange={(event) => setEditStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label><button className="primary-button" type="submit" disabled={busy}>Salvar alterações</button><button className="quiet-button" type="button" disabled={busy} onClick={() => setEditingTransactionId(null)}>Cancelar</button></form>}</li>)}</ul>}
            </section>

            <section className="panel" aria-labelledby="assistant-title">
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

            <section className="panel" aria-labelledby="receipt-title">
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
              <p className="muted-copy">A confirmação cria somente o lançamento. O armazenamento privado do arquivo e o vínculo do anexo ainda serão implementados separadamente.</p>
            </section>

            <section className="panel coming-panel"><span className="principles-label">PRÓXIMAS CONEXÕES</span><h2>Seu financeiro em expansão</h2><p>Importação CSV/OFX, notificações e automações serão conectadas em etapas testadas, preservando a separação entre valores realizados e previstos.</p></section>
            {notice && <p className="notice" role="status">{notice}</p>}
          </section>
        )}

        <footer className="app-footer"><span>GRANAVIVA</span><span>Privacidade · Clareza · Gratuito para todos</span></footer>
      </div>
    </main>
  );
}
