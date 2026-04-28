import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";

export const giftsRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          category: z.enum(["popular", "luxury", "romantic", "funny", "all"]).default("all"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      let query = supabase.from("gifts").select("*").eq("is_active", true);
      if (input?.category && input.category !== "all") {
        query = query.eq("category", input.category);
      }

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        price: g.price,
        category: g.category,
        isAnimated: g.is_animated,
        svgaUrl: g.svga_url || undefined,
        soundUrl: g.sound_url || undefined,
        soundDuration: g.sound_duration || undefined,
      }));
    }),

  send: protectedProcedure
    .input(
      z.object({
        giftId: z.string(),
        receiverId: z.string(),
        count: z.number().min(1).max(999),
        roomId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [senderResult, giftResult, receiverResult] = await Promise.all([
        supabase.from("users").select("coins").eq("id", ctx.userId).maybeSingle(),
        supabase.from("gifts").select("*").eq("id", input.giftId).maybeSingle(),
        supabase.from("users").select("diamonds").eq("id", input.receiverId).maybeSingle(),
      ]);

      if (!senderResult.data) throw new TRPCError({ code: "NOT_FOUND", message: "Sender not found" });
      if (!giftResult.data) throw new TRPCError({ code: "NOT_FOUND", message: "Gift not found" });
      if (!receiverResult.data) throw new TRPCError({ code: "NOT_FOUND", message: "Receiver not found" });

      const sender = senderResult.data;
      const gift = giftResult.data;
      const receiver = receiverResult.data;

      const totalCost = gift.price * input.count;
      if (sender.coins < totalCost) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient coins" });

      const receiverDiamonds = Math.floor(totalCost * 0.6);

      await Promise.all([
        supabase.from("users").update({ coins: sender.coins - totalCost }).eq("id", ctx.userId),
        supabase
          .from("users")
          .update({ diamonds: receiver.diamonds + receiverDiamonds })
          .eq("id", input.receiverId),
      ]);

      const tx = {
        id: `gt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sender_id: ctx.userId,
        receiver_id: input.receiverId,
        gift_id: gift.id,
        gift_name: gift.name,
        gift_icon: gift.icon,
        gift_price: gift.price,
        count: input.count,
        total_value: totalCost,
        room_id: input.roomId ?? "",
        timestamp: Date.now(),
      };
      const { error: txErr } = await supabase.from("gift_transactions").insert(tx);
      if (txErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: txErr.message });

      console.log("[Gifts] Sent:", ctx.userId, "->", input.receiverId, gift.name, "x", input.count);
      return {
        success: true,
        transaction: tx,
        senderCoins: sender.coins - totalCost,
        receiverDiamonds: receiver.diamonds + receiverDiamonds,
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        icon: z.string().min(1),
        price: z.number().min(1),
        category: z.enum(["popular", "luxury", "romantic", "funny"]),
        isAnimated: z.boolean(),
        svgaUrl: z.string().optional(),
        soundUrl: z.string().optional(),
        soundDuration: z.number().min(0).max(15).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const gift = {
        id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        icon: input.icon,
        price: input.price,
        category: input.category,
        is_animated: input.isAnimated,
        svga_url: input.svgaUrl ?? "",
        sound_url: input.soundUrl ?? "",
        sound_duration: input.soundDuration ?? 0,
        is_active: true,
        created_at: Date.now(),
      };
      const { error } = await supabase.from("gifts").insert(gift);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      console.log("[Admin] Created gift:", gift.id, input.name);
      return gift;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        icon: z.string().optional(),
        price: z.number().min(1).optional(),
        category: z.enum(["popular", "luxury", "romantic", "funny"]).optional(),
        isAnimated: z.boolean().optional(),
        svgaUrl: z.string().optional(),
        soundUrl: z.string().optional(),
        soundDuration: z.number().min(0).max(15).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.price !== undefined) updates.price = input.price;
      if (input.category !== undefined) updates.category = input.category;
      if (input.isAnimated !== undefined) updates.is_animated = input.isAnimated;
      if (input.svgaUrl !== undefined) updates.svga_url = input.svgaUrl;
      if (input.soundUrl !== undefined) updates.sound_url = input.soundUrl;
      if (input.soundDuration !== undefined) updates.sound_duration = input.soundDuration;
      if (input.isActive !== undefined) updates.is_active = input.isActive;

      const { data, error } = await supabase
        .from("gifts")
        .update(updates)
        .eq("id", input.id)
        .select()
        .maybeSingle();
      if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: error?.message ?? "Gift not found" });
      console.log("[Admin] Updated gift:", input.id);
      return data;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("gifts").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "NOT_FOUND", message: "Gift not found" });
      console.log("[Admin] Deleted gift:", input.id);
      return { success: true };
    }),

  transactions: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const { data, count, error } = await supabase
        .from("gift_transactions")
        .select("*", { count: "exact" })
        .order("timestamp", { ascending: false })
        .range((input.page - 1) * input.limit, input.page * input.limit - 1);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const total = count ?? 0;
      return { items: data ?? [], total, page: input.page, totalPages: Math.ceil(total / input.limit) };
    }),
});