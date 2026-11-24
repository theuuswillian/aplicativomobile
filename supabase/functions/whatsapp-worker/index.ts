import { createClient } from "npm:@supabase/supabase-js@2";
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

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const secret = Deno.env.get("WHATSAPP_WORKER_SECRET") ?? "";
  if (secret.length < 32 || !safeEqual(secret, request.headers.get("x-whatsapp-worker-secret") ?? "")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return Response.json({ error: "configuration" }, { status: 503 });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const expiredLease = new Date().toISOString();
  const { data: rows, error } = await db.from("whatsapp_inbox")
    .select("message_id,payload")
    .or(`status.eq.queued,status.eq.failed,and(status.eq.processing,lease_until.lt.${expiredLease})`)
    .order("created_at", { ascending: true }).limit(25);
  if (error) return Response.json({ error: "inbox_read_failed" }, { status: 503 });
  let processed = 0, failed = 0;
  for (const row of rows ?? []) {
    const reservationResult = await db.rpc("whatsapp_inbox_reserve", {
      p_message_id: row.message_id, p_payload: row.payload, p_lease_seconds: 180,
    });
    if (reservationResult.error) { failed++; continue; }
    const reservation = Array.isArray(reservationResult.data) ? reservationResult.data[0] : null;
    if (!reservation || reservation.reservation_status !== "reserved" || typeof reservation.fencing_token !== "string") continue;
    const finish = async (success: boolean, reason?: string) => {
      const result = await db.rpc("whatsapp_inbox_finalize", {
        p_message_id: row.message_id, p_fencing_token: reservation.fencing_token,
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
          const hash = await sha256Hex(command.code);
          const consumed = await db.rpc("whatsapp_link_consume", { p_code_hash: hash, p_phone: phone });
          if (consumed.error) throw new Error("link_consume_failed");
          reply = typeof consumed.data === "string"
            ? "WhatsApp vinculado com sucesso! Envie AJUDA para ver os comandos."
            : "Código inválido ou expirado. Gere outro código no aplicativo.";
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
  return Response.json({ processed, failed, fetched: rows?.length ?? 0 });
});
