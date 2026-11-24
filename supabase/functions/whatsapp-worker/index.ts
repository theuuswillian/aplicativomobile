import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../_shared/auth.ts";
import { parseWhatsAppCommand } from "../_shared/whatsapp-command.ts";

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
function todaySaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}


function shiftDate(date: string, days: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function previousWeekRange(): { monday: string; sunday: string } | null {
  const today = todaySaoPaulo();
  const weekday = new Date(today + "T12:00:00Z").getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  if (daysSinceMonday !== 0) return null;
  const monday = shiftDate(today, -7);
  return { monday, sunday: shiftDate(monday, 6) };
}
function decimalToCents(value: unknown): bigint {
  const text = String(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) return 0n;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}
function brl(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return (negative ? "-" : "") + "R$ " + whole + "," + fraction;
}
async function sendWeeklySummaries(
  db: SupabaseClient<Database, "public">, url: string, serviceKey: string, secret: string,
): Promise<{ sent: number; skipped: number; failed: number; queued: number }> {
  const range = previousWeekRange();
  if (!range) return { sent: 0, skipped: 0, failed: 0, queued: 0 };

  // O texto e o destinatário são persistidos antes de qualquer tentativa.
  // Assim, toda repetição reutiliza exatamente o mesmo payload e a mesma chave
  // idempotente da outbox Meta, inclusive após timeout ou queda do worker.
  const { data: links, error: linksError } = await db.from("whatsapp_links")
    .select("user_id,phone").eq("weekly_summary_enabled", true)
    .or(`last_summary_week.is.null,last_summary_week.lt.${range.monday}`)
    .order("user_id", { ascending: true }).limit(2);
  if (linksError) return { sent: 0, skipped: 0, failed: 1, queued: 0 };

  let sent = 0, skipped = 0, failed = 0, queued = 0;
  for (const link of links ?? []) {
    try {
      const { data: settings, error: settingsError } = await db.from("settings")
        .select("whatsapp_weekly_summary").eq("user_id", link.user_id).maybeSingle();
      if (settingsError) throw new Error("summary_settings_failed");
      if (settings?.whatsapp_weekly_summary !== true) {
        const result = await db.rpc("whatsapp_summary_job_skip", {
          p_user_id: link.user_id, p_week: range.monday,
        });
        if (result.error) throw new Error("summary_skip_failed");
        skipped++;
        continue;
      }

      const { data: transactions, error: transactionError } = await db.from("transactions")
        .select("kind,amount").eq("user_id", link.user_id).eq("status", "paid")
        .gte("transaction_date", range.monday).lte("transaction_date", range.sunday);
      if (transactionError) throw new Error("summary_transactions_failed");
      let income = 0n, expense = 0n;
      for (const transaction of transactions ?? []) {
        const amount = decimalToCents(transaction.amount);
        if (transaction.kind === "income") income += amount;
        else if (transaction.kind === "expense") expense += amount;
      }
      const message = "Resumo semanal GranaViva (" + range.monday + " a " + range.sunday + ")" +
        "\nReceitas realizadas: " + brl(income) +
        "\nDespesas realizadas: " + brl(expense) +
        "\nSaldo do período: " + brl(income - expense) +
        "\nSomente lançamentos realizados foram considerados.";
      const { error: enqueueError } = await db.rpc("whatsapp_summary_job_enqueue", {
        p_user_id: link.user_id, p_week: range.monday, p_phone: link.phone, p_message: message,
      });
      if (enqueueError) throw new Error("summary_enqueue_failed");
      queued++;
    } catch { failed++; }
  }

  const now = new Date().toISOString();
  // Keep the total outbound calls bounded per invocation: two inbox replies and two summaries at most.
  const { data: jobs, error: jobsError } = await db.from("whatsapp_weekly_summary_jobs")
    .select("user_id,week_start")
    .eq("week_start", range.monday)
    .or(`status.eq.pending,and(status.eq.processing,lease_until.lt.${now})`)
    .order("user_id", { ascending: true }).limit(2);
  if (jobsError) return { sent, skipped, failed: failed + 1, queued };

  for (const job of jobs ?? []) {
    try {
      const { data: reservations, error: reserveError } = await db.rpc("whatsapp_summary_job_claim", {
        p_user_id: job.user_id, p_week: job.week_start, p_lease_seconds: 180,
      });
      if (reserveError) throw new Error("summary_claim_failed");
      const reservation = Array.isArray(reservations) ? reservations[0] : null;
      if (!reservation) throw new Error("summary_claim_missing");
      if (reservation.reservation_status === "skipped") { skipped++; continue; }
      if (reservation.reservation_status !== "reserved" ||
          typeof reservation.fencing_token !== "string" ||
          typeof reservation.phone !== "string" || typeof reservation.message !== "string") continue;

      let outcome = "pending";
      let errorMessage = "Resumo será tentado novamente com a mesma chave idempotente.";
      try {
        const response = await fetch(url + "/functions/v1/whatsapp-meta-send", {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
          headers: {
            Authorization: "Bearer " + serviceKey, "Content-Type": "application/json",
            "x-whatsapp-worker-secret": secret,
          },
          body: JSON.stringify({
            idempotency_key: "weekly:" + job.user_id + ":" + range.monday,
            phone: reservation.phone, text: reservation.message,
          }),
        });
        const result = await response.json().catch(() => null) as { data?: { status?: string } } | null;
        const providerStatus = result?.data?.status;
        if (providerStatus === "sent") outcome = "sent";
        else if (providerStatus === "uncertain") outcome = "uncertain";
        else if (providerStatus === "failed") outcome = "failed";
        else if (providerStatus === "failed_safe" || providerStatus === "busy" || !response.ok) outcome = "pending";
        else outcome = "pending";
        errorMessage = providerStatus ? "Meta outbox: " + providerStatus : "Resposta da Meta sem estado confirmado.";
      } catch {
        // Repetir a chamada interna é seguro: whatsapp-meta-send e a outbox
        // resolvem a mesma chave como sent/uncertain/failed_safe, sem duplicar.
        outcome = "pending";
      }

      const { data: finalized, error: finalizeError } = await db.rpc("whatsapp_summary_job_finalize", {
        p_user_id: job.user_id, p_week: job.week_start,
        p_fencing_token: reservation.fencing_token,
        p_status: outcome, p_error: errorMessage,
      });
      if (finalizeError || finalized !== true) throw new Error("summary_finalize_failed");
      if (outcome === "sent") sent++;
      else if (outcome === "uncertain" || outcome === "failed") failed++;
      else queued++;
    } catch { failed++; }
  }
  return { sent, skipped, failed, queued };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const secret = Deno.env.get("WHATSAPP_WORKER_SECRET") ?? "";
  if (secret.length < 32 || !safeEqual(secret, request.headers.get("x-whatsapp-worker-secret") ?? "")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return Response.json({ error: "configuration" }, { status: 503 });
  const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const expiredLease = new Date().toISOString();
  const { data: rows, error } = await db.from("whatsapp_inbox")
    .select("message_id,payload")
    .or(`status.eq.queued,status.eq.failed,and(status.eq.processing,lease_until.lt.${expiredLease})`)
    .order("created_at", { ascending: true }).limit(2);
  if (error) return Response.json({ error: "inbox_read_failed" }, { status: 503 });
  let processed = 0, failed = 0;
  for (const row of rows ?? []) {
    const reservationResult = await db.rpc("whatsapp_inbox_reserve", {
      p_message_id: row.message_id, p_payload: row.payload, p_lease_seconds: 180,
    });
    if (reservationResult.error) { failed++; continue; }
    const reservation = Array.isArray(reservationResult.data) ? reservationResult.data[0] : null;
    if (!reservation || reservation.reservation_status !== "reserved" || typeof reservation.fencing_token !== "string") continue;
    const fencingToken = reservation.fencing_token;
    const finish = async (success: boolean, reason?: string) => {
      const result = await db.rpc("whatsapp_inbox_finalize", {
        p_message_id: row.message_id, p_fencing_token: fencingToken,
        p_success: success, p_error: reason ?? null,
      });
      return !result.error && result.data === true;
    };
    try {
      const payload = row.payload as Record<string, unknown>;
      const message = payload?.message as Record<string, unknown> | undefined;
      if (payload?.provider !== "meta_whatsapp_cloud" || !message ||
          typeof message.from !== "string" || !/^\d{8,15}$/.test(message.from) ||
          typeof message.id !== "string" || message.id !== row.message_id) {
        await finish(false, "Envelope de mensagem inválido"); failed++; continue;
      }
      const phone = `+${message.from}`;
      const command = parseWhatsAppCommand(message.type === "text" ? message.text : null);
      let reply = "";
      const { data: link, error: linkError } = await db.from("whatsapp_links")
        .select("user_id").eq("phone", phone).maybeSingle();
      if (linkError) throw new Error("link_lookup_failed");
      const userId: string | null = link?.user_id ?? null;

      if (!userId) {
        if (command.kind !== "link") {
          reply = "Para vincular, gere um código no GranaViva e envie os 6 dígitos aqui. O código expira em 10 minutos.";
        } else {
          const attempt = await db.rpc("whatsapp_link_attempt_allow", { p_phone: phone });
          if (attempt.error) throw new Error("link_attempt_rate_limit_failed");
          if (attempt.data !== true) {
            reply = "Muitas tentativas de vinculação. Aguarde 15 minutos antes de tentar novamente.";
          } else {
            const hash = await sha256Hex(command.code);
            const consumed = await db.rpc("whatsapp_link_consume", { p_code_hash: hash, p_phone: phone });
            if (consumed.error) throw new Error("link_consume_failed");
            reply = typeof consumed.data === "string"
              ? "WhatsApp vinculado com sucesso! Envie AJUDA para ver os comandos."
              : "Código inválido ou expirado. Gere outro código no aplicativo.";
          }
        }
      } else if (command.kind === "help") {
        reply = "Comandos disponíveis:\nDESPESA 12,50 descrição\nRECEITA 20,00 descrição\nCONFIRMAR ID\nCANCELAR ID\nCada lançamento fica pendente até sua confirmação.";
      } else if (command.kind === "transaction") {
        const { data: accounts, error: accountsError } = await db.from("accounts")
          .select("id,name,is_primary").eq("user_id", userId).eq("is_archived", false);
        if (accountsError) throw new Error("accounts_lookup_failed");
        const available = accounts ?? [];
        const selected = available.find((account) => account.is_primary) ?? (available.length === 1 ? available[0] : null);
        if (!selected) {
          reply = available.length === 0
            ? "Cadastre uma conta ativa no GranaViva antes de lançar pelo WhatsApp."
            : "Não consegui escolher uma conta com segurança. Defina uma conta principal no GranaViva e tente novamente.";
        } else {
          const pendingId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
          const pendingPayload = {
            kind: command.transactionKind, amount: command.amount, transaction_date: todaySaoPaulo(),
            description: command.description, category_id: null, account_id: selected.id, card_id: null,
          };
          const { error: insertError } = await db.from("whatsapp_pending_transactions").insert({
            id: pendingId, user_id: userId, phone, payload: pendingPayload,
            source_message_id: row.message_id, status: "pending", expires_at: expiresAt,
          });
          if (insertError) {
            if (insertError.code === "23505") reply = "Este lançamento já foi recebido. Consulte o aplicativo antes de tentar novamente.";
            else throw new Error("pending_insert_failed");
          } else {
            const label = command.transactionKind === "expense" ? "Despesa" : "Receita";
            reply = `${label} pendente:\nR$ ${command.amount.replace(".", ",")} — ${command.description}\nConta: ${selected.name}\nConfirme em até 15 minutos:\nCONFIRMAR ${pendingId}\nPara descartar: CANCELAR ${pendingId}`;
          }
        }
      } else if (command.kind === "confirm") {
        const { data: pending, error: pendingError } = await db.from("whatsapp_pending_transactions")
          .select("id,status").eq("id", command.pendingId).eq("user_id", userId).eq("phone", phone).maybeSingle();
        if (pendingError) throw new Error("pending_lookup_failed");
        if (!pending) reply = "Lançamento não encontrado ou não pertence a este número.";
        else if (pending.status === "confirmed") reply = "Este lançamento já foi confirmado.";
        else {
          const { data: result, error: confirmError } = await db.rpc("whatsapp_pending_confirm", { p_pending_id: command.pendingId });
          if (confirmError) throw new Error("pending_confirm_failed");
          const outcome = Array.isArray(result) ? result[0]?.result : null;
          reply = outcome === "confirmed" ? "Lançamento confirmado e salvo no GranaViva."
            : outcome === "expired" ? "Este lançamento expirou. Envie um novo comando."
            : "Não foi possível confirmar. Confira o lançamento no aplicativo.";
        }
      } else if (command.kind === "cancel") {
        const { data: updated, error: cancelError } = await db.from("whatsapp_pending_transactions")
          .update({ status: "cancelled" }).eq("id", command.pendingId).eq("user_id", userId)
          .eq("phone", phone).eq("status", "pending").select("id").maybeSingle();
        if (cancelError) throw new Error("pending_cancel_failed");
        reply = updated ? "Lançamento pendente cancelado." : "Lançamento não encontrado, já processado ou expirado.";
      } else {
        reply = "Não entendi a mensagem. Envie AJUDA para consultar os comandos disponíveis.";
      }

      const sendResponse = await fetch(`${url}/functions/v1/whatsapp-meta-send`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
        headers: {
          Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json",
          "x-whatsapp-worker-secret": secret,
        },
        body: JSON.stringify({
          idempotency_key: `inbound:${row.message_id}:reply`, phone, text: reply,
        }),
      });
      if (!sendResponse.ok) throw new Error("reply_delivery_failed");
      const sent = await sendResponse.json().catch(() => null) as { data?: { status?: string } } | null;
      if (!sent?.data?.status || !["sent", "uncertain", "failed", "failed_safe", "busy"].includes(sent.data.status)) {
        throw new Error("reply_status_unknown");
      }
      if (!await finish(true)) throw new Error("inbox_fencing_lost");
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "processing_failed";
      await finish(false, message);
      failed++;
    }
  }
  const summaries = await sendWeeklySummaries(db, url, serviceKey, secret);
  return Response.json({ processed, failed, fetched: rows?.length ?? 0, summaries });
});
