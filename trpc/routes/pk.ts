import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";

export const pkRouter = createTRPCRouter({
  // PK Reward Tiers
  rewardTiers: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("pk_reward_tiers")
      .select("*")
      .eq("is_active", true)
      .order("min_points", { ascending: true });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((t) => ({
      tier: t.tier,
      label: t.label,
      minPoints: t.min_points,
      bonusMultiplier: Number(t.bonus_multiplier),
      awardBonus: t.award_bonus,
      color: t.color,
      icon: t.icon,
    }));
  }),

  // PK Challenge Banners
  challengeBanners: publicProcedure
    .input(
      z.object({
        status: z.enum(["upcoming", "live", "completed", "all"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("pk_challenge_banners")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (input.status !== "all") query = query.eq("status", input.status);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        bannerImage: b.banner_image,
        playerA: {
          name: b.player_a_name,
          avatar: b.player_a_avatar,
          level: b.player_a_level,
        },
        playerB: {
          name: b.player_b_name,
          avatar: b.player_b_avatar,
          level: b.player_b_level,
        },
        scheduledDate: b.scheduled_date,
        startTime: b.start_time,
        endTime: b.end_time,
        prizePool: b.prize_pool,
        status: b.status,
        matchType: b.match_type,
        entryFee: b.entry_fee,
        maxViewers: b.max_viewers,
        tags: b.tags,
        createdAt: b.created_at,
        isActive: b.is_active,
      }));
    }),

  // User's PK Points Profile
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("pk_points_profiles")
      .select("*")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    if (!data) {
      // Create profile if doesn't exist
      await supabase.from("pk_points_profiles").insert({
        user_id: ctx.userId,
        total_points: 0,
        total_wins: 0,
        total_losses: 0,
        total_draws: 0,
        current_streak: 0,
        best_streak: 0,
        earnings_from_points: 0,
        current_tier: "bronze",
        updated_at: Date.now(),
      });

      return {
        totalPoints: 0,
        totalWins: 0,
        totalLosses: 0,
        totalDraws: 0,
        currentStreak: 0,
        bestStreak: 0,
        earningsFromPoints: 0,
        tier: "bronze",
        nextTierPoints: 50,
        bonusMultiplier: 1.0,
        recentMatches: [],
      };
    }

    // Get recent matches
    const { data: matches } = await supabase
      .from("pk_match_history")
      .select("*")
      .eq("user_id", ctx.userId)
      .order("timestamp", { ascending: false })
      .limit(10);

    // Get next tier
    const { data: tiers } = await supabase
      .from("pk_reward_tiers")
      .select("*")
      .eq("is_active", true)
      .order("min_points", { ascending: true });

    const tierList = tiers ?? [];
    const currentTierIndex = tierList.findIndex((t) => t.tier === data.current_tier);
    const nextTier = currentTierIndex < tierList.length - 1 ? tierList[currentTierIndex + 1] : null;

    return {
      totalPoints: data.total_points,
      totalWins: data.total_wins,
      totalLosses: data.total_losses,
      totalDraws: data.total_draws,
      currentStreak: data.current_streak,
      bestStreak: data.best_streak,
      earningsFromPoints: data.earnings_from_points,
      tier: data.current_tier,
      nextTierPoints: nextTier?.min_points ?? data.total_points,
      bonusMultiplier: Number(tierList[currentTierIndex]?.bonus_multiplier ?? 1.0),
      recentMatches: (matches ?? []).map((m) => ({
        id: m.id,
        opponentName: m.opponent_name,
        opponentAvatar: m.opponent_avatar,
        result: m.result,
        pointsEarned: m.points_earned,
        bonusEarned: Number(m.bonus_earned),
        coinsWagered: m.coins_wagered,
        timestamp: m.timestamp,
      })),
    };
  }),

  // Active PK Battles
  activeBattles: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("pk_battles")
      .select("*, users!pk_battles_host_a_id_fkey(id, name, avatar, level), users!pk_battles_host_b_id_fkey(id, name, avatar, level)")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((b: any) => ({
      id: b.id,
      hostA: {
        id: b.users?.id,
        name: b.users?.name,
        avatar: b.users?.avatar,
        level: b.users?.level,
      },
      hostB: {
        id: b.users?.id,
        name: b.users?.name,
        avatar: b.users?.avatar,
        level: b.users?.level,
      },
      scoreA: b.score_a,
      scoreB: b.score_b,
      timeRemaining: b.time_remaining,
      status: b.status,
      winStreakA: b.win_streak_a,
      winStreakB: b.win_streak_b,
      coinsBet: b.coins_bet,
      pointsForWin: b.points_for_win,
    }));
  }),

  // Admin: Create PK Challenge Banner
  createChallengeBanner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        description: z.string(),
        bannerImage: z.string(),
        playerAName: z.string(),
        playerAAvatar: z.string(),
        playerALevel: z.number(),
        playerBName: z.string(),
        playerBAvatar: z.string(),
        playerBLevel: z.number(),
        scheduledDate: z.number(),
        startTime: z.string(),
        endTime: z.string(),
        prizePool: z.number(),
        matchType: z.enum(["solo", "team", "tournament"]),
        entryFee: z.number(),
        maxViewers: z.number(),
        tags: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("pk_challenge_banners").insert({
        id: `pkb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: input.title,
        description: input.description,
        banner_image: input.bannerImage,
        player_a_name: input.playerAName,
        player_a_avatar: input.playerAAvatar,
        player_a_level: input.playerALevel,
        player_b_name: input.playerBName,
        player_b_avatar: input.playerBAvatar,
        player_b_level: input.playerBLevel,
        scheduled_date: input.scheduledDate,
        start_time: input.startTime,
        end_time: input.endTime,
        prize_pool: input.prizePool,
        status: "upcoming",
        match_type: input.matchType,
        entry_fee: input.entryFee,
        max_viewers: input.maxViewers,
        tags: input.tags,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
