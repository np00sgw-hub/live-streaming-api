import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context.js";
import { supabase } from "../../lib/supabase.js";

export const agenciesRouter = createTRPCRouter({
  // List all agencies
  list: publicProcedure
    .input(
      z.object({
        tier: z.enum(["bronze", "silver", "gold", "diamond", "all"]).default("all"),
        isOpen: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("agencies")
        .select("*, users!agencies_owner_id_fkey(id, name, avatar)")
        .eq("is_active", true);

      if (input.tier !== "all") query = query.eq("tier", input.tier);
      if (input.isOpen !== undefined) query = query.eq("is_open", input.isOpen);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        logo: a.logo,
        ownerName: a.users?.name,
        ownerAvatar: a.users?.avatar,
        memberCount: a.member_count,
        maxMembers: a.max_members,
        description: a.description,
        benefits: a.benefits,
        tier: a.tier,
        commissionRate: a.commission_rate,
        isOpen: a.is_open,
        code: a.referral_code,
        rating: a.rating,
        totalEarnings: a.total_earnings,
      }));
    }),

  // Get agency by code
  getByCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
    const { data, error } = await supabase
      .from("agencies")
      .select("*, users!agencies_owner_id_fkey(id, name, avatar)")
      .eq("referral_code", input.code.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });

    return {
      id: data.id,
      name: data.name,
      logo: data.logo,
      ownerName: data.users?.name,
      ownerAvatar: data.users?.avatar,
      memberCount: data.member_count,
      maxMembers: data.max_members,
      description: data.description,
      benefits: data.benefits,
      tier: data.tier,
      commissionRate: data.commission_rate,
      isOpen: data.is_open,
      code: data.referral_code,
      rating: data.rating,
      totalEarnings: data.total_earnings,
    };
  }),

  // Join agency
  join: protectedProcedure
    .input(z.object({ agencyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: agency, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", input.agencyId)
        .maybeSingle();

      if (agencyError || !agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      if (!agency.is_open) throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is not accepting new members" });
      if (agency.member_count >= agency.max_members) throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is full" });

      // Check if already a member
      const { data: existingMember } = await supabase
        .from("agency_members")
        .select("*")
        .eq("user_id", ctx.userId)
        .maybeSingle();

      if (existingMember) throw new TRPCError({ code: "BAD_REQUEST", message: "Already a member of an agency" });

      // Add to agency
      await supabase.from("agency_members").insert({
        id: `am_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        agency_id: input.agencyId,
        user_id: ctx.userId,
        level: 1,
        joined_at: Date.now(),
        total_diamonds_earned: 0,
        commission_paid: 0,
        is_active: true,
      });

      // Update agency member count
      await supabase
        .from("agencies")
        .update({ member_count: agency.member_count + 1 })
        .eq("id", input.agencyId);

      // Update user agency status
      await supabase.from("users").update({ is_agency: true, agency_name: agency.name }).eq("id", ctx.userId);

      return { success: true };
    }),

  // Get user's agency stats
  getUserStats: protectedProcedure.query(async ({ ctx }) => {
    const { data: member, error: memberError } = await supabase
      .from("agency_members")
      .select("*, agencies(*)")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (memberError || !member) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member of any agency" });

    const { data: downlines, error: downlinesError } = await supabase
      .from("agency_members")
      .select("*, users(id, name, avatar, level)")
      .eq("agency_id", member.agency_id)
      .order("joined_at", { ascending: false });

    if (downlinesError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: downlinesError.message });

    return {
      agencyId: member.agency_id,
      agencyName: member.agencies?.name,
      totalDiamondsAllTime: member.total_diamonds_earned,
      commissionPaid: member.commission_paid,
      level: member.level,
      joinedAt: member.joined_at,
      downlines: (downlines ?? []).map((d: any) => ({
        id: d.id,
        user: {
          id: d.users?.id,
          name: d.users?.name,
          avatar: d.users?.avatar,
          level: d.users?.level,
        },
        level: d.level,
        totalDiamondsEarned: d.total_diamonds_earned,
        commissionPaid: d.commission_paid,
        joinedAt: d.joined_at,
        isActive: d.is_active,
      })),
    };
  }),

  // Admin: Create agency
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        logo: z.string(),
        ownerId: z.string(),
        maxMembers: z.number().min(10).max(500),
        description: z.string(),
        benefits: z.array(z.string()),
        tier: z.enum(["bronze", "silver", "gold", "diamond"]),
        commissionRate: z.number().min(5).max(25),
        isOpen: z.boolean(),
        referralCode: z.string().min(3).max(20),
      })
    )
    .mutation(async ({ input }) => {
      // Check if code already exists
      const { data: existing } = await supabase
        .from("agencies")
        .select("id")
        .eq("referral_code", input.referralCode.toUpperCase())
        .maybeSingle();

      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Referral code already exists" });

      const { error } = await supabase.from("agencies").insert({
        id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        logo: input.logo,
        owner_id: input.ownerId,
        member_count: 1,
        max_members: input.maxMembers,
        description: input.description,
        benefits: input.benefits,
        tier: input.tier,
        commission_rate: input.commissionRate,
        is_open: input.isOpen,
        referral_code: input.referralCode.toUpperCase(),
        rating: 0,
        total_earnings: 0,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      // Add owner as first member
      await supabase.from("agency_members").insert({
        id: `am_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        agency_id: input.referralCode.toUpperCase(),
        user_id: input.ownerId,
        level: 1,
        joined_at: Date.now(),
        total_diamonds_earned: 0,
        commission_paid: 0,
        is_active: true,
      });

      return { success: true };
    }),
});
