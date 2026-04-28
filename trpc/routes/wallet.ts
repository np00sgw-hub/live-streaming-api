import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";

// ── helpers ──────────────────────────────────────────────────────────────────

type TxType =
  | "topup" | "gift_sent" | "gift_received" | "vip_purchase"
  | "withdrawal" | "admin_credit" | "admin_debit" | "diamond_exchange";

async function addTransaction(tx: {
  userId: string;
  type: TxType;
  amount: number;
  description: string;
  status: "completed" | "pending" | "failed";
  metadata: Record<string, string>;
}) {
  const record = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: tx.userId,
    type: tx.type,
    amount: tx.amount,
    description: tx.description,
    status: tx.status,
    timestamp: Date.now(),
    metadata: tx.metadata,
  };
  const { error } = await supabase.from("transactions").insert(record);
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return record;
}

// ── router ────────────────────────────────────────────────────────────────────

export const walletRouter = createTRPCRouter({
  balance: protectedProcedure.query(async ({ ctx }) => {
    const { data: user, error } = await supabase
      .from("users")
      .select("coins, diamonds")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return { coins: user.coins, diamonds: user.diamonds };
  }),

  history: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
        type: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = supabase
        .from("transactions")
        .select("*", { count: "exact" })
        .eq("user_id", ctx.userId)
        .order("timestamp", { ascending: false })
        .range((input.page - 1) * input.limit, input.page * input.limit - 1);

      if (input.type) query = query.eq("type", input.type);

      const { data, count, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const total = count ?? 0;
      return {
        items: data ?? [],
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  topUp: protectedProcedure
    .input(
      z.object({
        packageId: z.string(),
        coins: z.number().min(1),
        price: z.number().min(0),
        bonus: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: user, error: fetchErr } = await supabase
        .from("users")
        .select("coins")
        .eq("id", ctx.userId)
        .maybeSingle();
      if (fetchErr || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const totalCoins = input.coins + input.bonus;
      const newCoins = user.coins + totalCoins;

      const { error: updateErr } = await supabase
        .from("users")
        .update({ coins: newCoins })
        .eq("id", ctx.userId);
      if (updateErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateErr.message });

      const tx = await addTransaction({
        userId: ctx.userId,
        type: "topup",
        amount: totalCoins,
        description: `Top Up - $${input.price} Package (+${input.bonus} bonus)`,
        status: "completed",
        metadata: { packageId: input.packageId, price: input.price.toString() },
      });

      console.log("[Wallet] Top up:", ctx.userId, totalCoins, "coins");
      return { success: true, newBalance: newCoins, transaction: tx };
    }),

  exchangeDiamonds: protectedProcedure
    .input(z.object({ diamonds: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data: user, error: fetchErr } = await supabase
        .from("users")
        .select("coins, diamonds")
        .eq("id", ctx.userId)
        .maybeSingle();
      if (fetchErr || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (user.diamonds < input.diamonds) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient diamonds" });

      const coinsReceived = Math.floor(input.diamonds * 10);
      const { error: updateErr } = await supabase
        .from("users")
        .update({ diamonds: user.diamonds - input.diamonds, coins: user.coins + coinsReceived })
        .eq("id", ctx.userId);
      if (updateErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateErr.message });

      await addTransaction({
        userId: ctx.userId,
        type: "diamond_exchange",
        amount: coinsReceived,
        description: `Exchanged ${input.diamonds} diamonds for ${coinsReceived} coins`,
        status: "completed",
        metadata: { diamondsSpent: input.diamonds.toString() },
      });

      console.log("[Wallet] Diamond exchange:", ctx.userId, input.diamonds, "->", coinsReceived);
      return {
        success: true,
        coins: user.coins + coinsReceived,
        diamonds: user.diamonds - input.diamonds,
      };
    }),

  requestWithdrawal: protectedProcedure
    .input(
      z.object({
        amount: z.number().min(100),
        method: z.string().min(1),
        accountInfo: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: user, error: fetchErr } = await supabase
        .from("users")
        .select("diamonds")
        .eq("id", ctx.userId)
        .maybeSingle();
      if (fetchErr || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (user.diamonds < input.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient diamonds for withdrawal" });

      const { error: updateErr } = await supabase
        .from("users")
        .update({ diamonds: user.diamonds - input.amount })
        .eq("id", ctx.userId);
      if (updateErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateErr.message });

      const requestId = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const { error: insertErr } = await supabase.from("withdrawal_requests").insert({
        id: requestId,
        user_id: ctx.userId,
        amount: input.amount,
        method: input.method,
        account_info: input.accountInfo,
        status: "pending",
        created_at: Date.now(),
        processed_at: null,
        processed_by: null,
        rejection_reason: null,
      });
      if (insertErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: insertErr.message });

      await addTransaction({
        userId: ctx.userId,
        type: "withdrawal",
        amount: -input.amount,
        description: `Withdrawal request - ${input.amount} diamonds via ${input.method}`,
        status: "pending",
        metadata: { withdrawalId: requestId, method: input.method },
      });

      console.log("[Wallet] Withdrawal request:", ctx.userId, input.amount, input.method);
      return { success: true, requestId };
    }),

  listWithdrawals: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected", "all"]).default("all"),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("withdrawal_requests")
        .select("*, users!withdrawal_requests_user_id_fkey(name, avatar)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((input.page - 1) * input.limit, input.page * input.limit - 1);

      if (input.status !== "all") query = query.eq("status", input.status);

      const { data, count, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const total = count ?? 0;
      return {
        items: (data ?? []).map((w: Record<string, unknown> & { users?: { name?: string; avatar?: string } }) => ({
          ...w,
          users: undefined,
          userName: w.users?.name ?? "Unknown",
          userAvatar: w.users?.avatar ?? "",
        })),
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  processWithdrawal: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        action: z.enum(["approve", "reject"]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: request, error: fetchErr } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("id", input.requestId)
        .maybeSingle();
      if (fetchErr || !request) throw new TRPCError({ code: "NOT_FOUND", message: "Withdrawal request not found" });
      if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request already processed" });

      if (input.action === "approve") {
        await supabase
          .from("withdrawal_requests")
          .update({ status: "approved", processed_at: Date.now(), processed_by: ctx.userId })
          .eq("id", input.requestId);
      } else {
        await supabase
          .from("withdrawal_requests")
          .update({
            status: "rejected",
            processed_at: Date.now(),
            processed_by: ctx.userId,
            rejection_reason: input.reason ?? "Request denied",
          })
          .eq("id", input.requestId);

        // Refund diamonds
        const { data: user } = await supabase
          .from("users")
          .select("diamonds")
          .eq("id", request.user_id)
          .maybeSingle();
        if (user) {
          await supabase
            .from("users")
            .update({ diamonds: user.diamonds + request.amount })
            .eq("id", request.user_id);
        }
      }

      console.log("[Admin] Withdrawal", input.action, ":", input.requestId);
      return { success: true };
    }),

  adminStats: adminProcedure.query(async () => {
    const [txResult, wdResult] = await Promise.all([
      supabase.from("transactions").select("type, amount"),
      supabase.from("withdrawal_requests").select("status, amount"),
    ]);

    const txs = txResult.data ?? [];
    const wds = wdResult.data ?? [];

    const totalTransactions = txs.length;
    const totalTopUps = txs.filter((t) => t.type === "topup").reduce((s, t) => s + t.amount, 0);
    const totalGiftsSent = txs.filter((t) => t.type === "gift_sent").length;
    const pendingWithdrawals = wds.filter((w) => w.status === "pending").length;
    const totalWithdrawalsApproved = wds
      .filter((w) => w.status === "approved")
      .reduce((s, w) => s + w.amount, 0);

    return { totalTransactions, totalTopUps, totalGiftsSent, pendingWithdrawals, totalWithdrawalsApproved };
  }),
});

export { addTransaction };