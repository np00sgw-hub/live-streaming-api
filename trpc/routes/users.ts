import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";
export const usersRouter = createTRPCRouter({
  getById: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const { data: user, error } = await supabase
        .from("users")
        .select("id, name, avatar, level, gender, is_vip, vip_level, coins, diamonds, followers, following, friends, visitors, bio, special_id, is_agency")
        .eq("id", input.userId)
        .maybeSingle();

      if (error || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        level: user.level,
        gender: user.gender,
        isVip: user.is_vip,
        vipLevel: user.vip_level,
        coins: user.coins,
        diamonds: user.diamonds,
        followers: user.followers,
        following: user.following,
        friends: user.friends,
        visitors: user.visitors,
        bio: user.bio,
        specialId: user.special_id,
        isAgency: user.is_agency,
      };
    }),

  search: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, avatar, level, is_vip")
        .ilike("name", `%${input.query}%`)
        .limit(20);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        level: u.level,
        isVip: u.is_vip,
      }));
    }),

  list: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("users")
        .select(
          "id, name, email, avatar, level, gender, is_vip, vip_level, coins, diamonds, is_admin, is_agency, is_banned, created_at, last_login",
          { count: "exact" }
        )
        .range((input.page - 1) * input.limit, input.page * input.limit - 1);

      if (input.search) {
        const q = input.search;
        query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,id.ilike.%${q}%`);
      }

      const { data, count, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const total = count ?? 0;
      return {
        items: (data ?? []).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
          level: u.level,
          gender: u.gender,
          isVip: u.is_vip,
          vipLevel: u.vip_level,
          coins: u.coins,
          diamonds: u.diamonds,
          isAdmin: u.is_admin,
          isAgency: u.is_agency,
          isBanned: u.is_banned,
          createdAt: u.created_at,
          lastLogin: u.last_login,
        })),
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  updateCoins: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const { data: user, error: fetchErr } = await supabase
        .from("users")
        .select("coins")
        .eq("id", input.userId)
        .maybeSingle();
      if (fetchErr || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const newBalance = Math.max(0, user.coins + input.amount);
      const { error } = await supabase.from("users").update({ coins: newBalance }).eq("id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Admin] Updated coins for", input.userId, "by", input.amount, "reason:", input.reason);
      return { success: true, newBalance };
    }),

  updateDiamonds: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const { data: user, error: fetchErr } = await supabase
        .from("users")
        .select("diamonds")
        .eq("id", input.userId)
        .maybeSingle();
      if (fetchErr || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const newBalance = Math.max(0, user.diamonds + input.amount);
      const { error } = await supabase.from("users").update({ diamonds: newBalance }).eq("id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Admin] Updated diamonds for", input.userId, "by", input.amount, "reason:", input.reason);
      return { success: true, newBalance };
    }),

  banUser: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { data: user, error: fetchErr } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", input.userId)
        .maybeSingle();
      if (fetchErr || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (user.is_admin) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot ban an admin" });

      const { error } = await supabase
        .from("users")
        .update({ is_banned: true, ban_reason: input.reason })
        .eq("id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Admin] Banned user:", input.userId, "reason:", input.reason);
      return { success: true };
    }),

  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from("users")
        .update({ is_banned: false, ban_reason: "" })
        .eq("id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Admin] Unbanned user:", input.userId);
      return { success: true };
    }),

  setVip: adminProcedure
    .input(z.object({ userId: z.string(), vipLevel: z.number().min(0).max(4) }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from("users")
        .update({ is_vip: input.vipLevel > 0, vip_level: input.vipLevel })
        .eq("id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Admin] Set VIP level for", input.userId, "to", input.vipLevel);
      return { success: true };
    }),

  setAdmin: adminProcedure
    .input(z.object({ userId: z.string(), isAdmin: z.boolean() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from("users")
        .update({ is_admin: input.isAdmin })
        .eq("id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Admin] Set admin for", input.userId, "to", input.isAdmin);
      return { success: true };
    }),

  setAgency: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        isAgency: z.boolean(),
        agencyName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from("users")
        .update({ is_agency: input.isAgency, agency_name: input.agencyName ?? "" })
        .eq("id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Admin] Set agency for", input.userId, "to", input.isAgency);
      return { success: true };
    }),

    online: publicProcedure
  .input(
    z.object({
      limit: z.number().min(1).max(50).default(12),
    }).optional()
  )
  .query(async ({ input }) => {
    const limit = input?.limit ?? 12;

    const { data, error } = await supabase
      .from("users")
      .select("id, name, avatar, level, gender, is_vip, vip_level")
      .eq("is_online", true)
      .order("level", { ascending: false })
      .limit(limit);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return (data ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      level: u.level,
      gender: u.gender,
      isVip: u.is_vip,
      vipLevel: u.vip_level ?? 0,
    }));
  }),
});