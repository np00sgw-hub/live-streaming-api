import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";

export const contentRouter = createTRPCRouter({
  // Scheduled Lives
  scheduledLives: publicProcedure
    .input(
      z.object({
        status: z.enum(["upcoming", "completed", "cancelled", "expired", "all"]).default("upcoming"),
        userId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("scheduled_lives")
        .select("*, users!scheduled_lives_host_id_fkey(id, name, avatar, level)")
        .eq("is_active", true)
        .order("scheduled_date", { ascending: true });

      if (input.status !== "all") query = query.eq("status", input.status);
      if (input.userId) query = query.eq("host_id", input.userId);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        scheduledDate: s.scheduled_date,
        startTime: s.start_time,
        endTime: s.end_time,
        validDays: s.valid_days,
        mode: s.mode,
        status: s.status,
        reminders: s.reminders,
        coverImage: s.cover_image,
        tags: s.tags,
        host: s.users ? { id: s.users.id, name: s.users.name, avatar: s.users.avatar, level: s.users.level } : null,
        createdAt: s.created_at,
      }));
    }),

  // Create Scheduled Live
  createScheduledLive: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        description: z.string(),
        scheduledDate: z.number(),
        startTime: z.string(),
        endTime: z.string(),
        validDays: z.number(),
        mode: z.enum(["video", "audio", "pk"]),
        coverImage: z.string(),
        tags: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase.from("scheduled_lives").insert({
        id: `sl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        host_id: ctx.userId,
        title: input.title,
        description: input.description,
        scheduled_date: input.scheduledDate,
        start_time: input.startTime,
        end_time: input.endTime,
        valid_days: input.validDays,
        mode: input.mode,
        status: "upcoming",
        reminders: 0,
        cover_image: input.coverImage,
        tags: input.tags,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Set reminder for scheduled live
  setReminder: protectedProcedure
    .input(z.object({ scheduledLiveId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: scheduled, error: fetchError } = await supabase
        .from("scheduled_lives")
        .select("reminders")
        .eq("id", input.scheduledLiveId)
        .maybeSingle();

      if (fetchError || !scheduled) throw new TRPCError({ code: "NOT_FOUND", message: "Scheduled live not found" });

      const { error } = await supabase
        .from("scheduled_lives")
        .update({ reminders: scheduled.reminders + 1 })
        .eq("id", input.scheduledLiveId);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Status Posts
  statusPosts: publicProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("status_posts")
        .select("*, users!status_posts_user_id_fkey(id, name, avatar, level)")
        .gt("expires_at", Date.now())
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (input.userId) query = query.eq("user_id", input.userId);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((s: any) => ({
        id: s.id,
        user: {
          id: s.users?.id,
          name: s.users?.name,
          avatar: s.users?.avatar,
          level: s.users?.level,
        },
        type: s.type,
        mediaUrl: s.media_url,
        thumbnailUrl: s.thumbnail_url,
        caption: s.caption,
        likes: s.likes,
        comments: s.comments,
        shares: s.shares,
        views: s.views,
        coinsEarned: s.coins_earned,
        isLiked: s.is_liked_by_current_user,
        isShared: s.is_shared,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
      }));
    }),

  // Create Status Post
  createStatusPost: protectedProcedure
    .input(
      z.object({
        type: z.enum(["photo", "video", "text"]),
        mediaUrl: z.string(),
        thumbnailUrl: z.string(),
        caption: z.string(),
        expiresInHours: z.number().min(1).max(24).default(24),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const expiresAt = Date.now() + input.expiresInHours * 60 * 60 * 1000;

      const { error } = await supabase.from("status_posts").insert({
        id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        user_id: ctx.userId,
        type: input.type,
        media_url: input.mediaUrl,
        thumbnail_url: input.thumbnailUrl,
        caption: input.caption,
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
        coins_earned: 0,
        is_liked_by_current_user: false,
        is_shared: false,
        created_at: Date.now(),
        expires_at: expiresAt,
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Cashback Gifts
  cashbackGifts: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("cashback_gifts")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      price: g.price,
      type: g.type,
      coinPool: g.coin_pool,
    }));
  }),

  // Active Cashback Bags
  activeCashbackBags: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("cashback_bags")
      .select("*")
      .eq("status", "waiting")
      .order("created_at", { ascending: false });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((b) => ({
      id: b.id,
      type: b.type,
      senderName: b.sender_name,
      senderAvatar: b.sender_avatar,
      senderLevel: b.sender_level,
      senderId: b.sender_id,
      roomName: b.room_name,
      roomId: b.room_id,
      totalCoins: b.total_coins,
      status: b.status,
      timeRemaining: b.time_remaining,
      createdAt: b.created_at,
    }));
  }),

  // Audio Tracks
  audioTracks: publicProcedure
    .input(
      z.object({
        genre: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("audio_tracks")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (input.genre) query = query.eq("genre", input.genre);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        coverUrl: t.cover_url,
        audioUrl: t.audio_url,
        genre: t.genre,
        isUploaded: t.is_uploaded,
      }));
    }),

  // Sports Matches
  sportsMatches: publicProcedure
    .input(
      z.object({
        sport: z.enum(["football", "cricket", "basketball", "tennis", "all"]).default("all"),
        status: z.enum(["upcoming", "live", "finished", "cancelled", "all"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      let query = supabase
        .from("sports_matches")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false });

      if (input.sport !== "all") query = query.eq("sport", input.sport);
      if (input.status !== "all") query = query.eq("status", input.status);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((m) => ({
        id: m.id,
        sport: m.sport,
        league: m.league,
        leagueIcon: m.league_icon,
        teamA: {
          name: m.team_a_name,
          shortName: m.team_a_short_name,
          logo: m.team_a_logo,
          color: m.team_a_color,
        },
        teamB: {
          name: m.team_b_name,
          shortName: m.team_b_short_name,
          logo: m.team_b_logo,
          color: m.team_b_color,
        },
        scoreA: m.score_a,
        scoreB: m.score_b,
        odds: {
          home: Number(m.odds_home),
          draw: Number(m.odds_draw),
          away: Number(m.odds_away),
        },
        status: m.status,
        startTime: m.start_time,
        isFeatured: m.is_featured,
      }));
    }),

  // User's Placed Bets
  userBets: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("placed_bets")
      .select("*, sports_matches(*)")
      .eq("user_id", ctx.userId)
      .order("placed_at", { ascending: false });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((b: any) => ({
      id: b.id,
      matchId: b.match_id,
      match: b.sports_matches,
      outcome: b.outcome,
      amount: b.amount,
      potentialWin: b.potential_win,
      status: b.status,
      placedAt: b.placed_at,
    }));
  }),

  // Place Bet
  placeBet: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        outcome: z.enum(["home", "draw", "away"]),
        amount: z.number().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("coins")
        .eq("id", ctx.userId)
        .maybeSingle();

      if (userError || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (user.coins < input.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient coins" });

      const { data: match, error: matchError } = await supabase
        .from("sports_matches")
        .select("*")
        .eq("id", input.matchId)
        .maybeSingle();

      if (matchError || !match) throw new TRPCError({ code: "NOT_FOUND", message: "Match not found" });
      if (match.status !== "upcoming") throw new TRPCError({ code: "BAD_REQUEST", message: "Match is not accepting bets" });

      const odds = input.outcome === "home" ? match.odds_home : input.outcome === "draw" ? match.odds_draw : match.odds_away;
      const potentialWin = Math.floor(input.amount * Number(odds));

      // Deduct coins
      await supabase.from("users").update({ coins: user.coins - input.amount }).eq("id", ctx.userId);

      // Place bet
      await supabase.from("placed_bets").insert({
        id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        user_id: ctx.userId,
        match_id: input.matchId,
        outcome: input.outcome,
        amount: input.amount,
        potential_win: potentialWin,
        status: "pending",
        placed_at: Date.now(),
      });

      return { success: true, potentialWin };
    }),

  // Gift Stats
  giftStats: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("gift_stats")
      .select("*")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    if (!data) {
      return {
        weekSent: 0,
        weekReceived: 0,
        monthSent: 0,
        monthReceived: 0,
        topGiftsSent: [],
        topGiftsReceived: [],
        weeklyHistory: [],
      };
    }

    return {
      weekSent: data.week_sent,
      weekReceived: data.week_received,
      monthSent: data.month_sent,
      monthReceived: data.month_received,
      topGiftsSent: data.top_gifts_sent,
      topGiftsReceived: data.top_gifts_received,
      weeklyHistory: data.weekly_history,
    };
  }),

  // Admin: Create Cashback Gift
  createCashbackGift: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        icon: z.string(),
        price: z.number().min(1),
        type: z.enum(["local", "global"]),
        coinPool: z.number().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("cashback_gifts").insert({
        id: `cb_g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        icon: input.icon,
        price: input.price,
        type: input.type,
        coin_pool: input.coinPool,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Admin: Create Sports Match
  createSportsMatch: adminProcedure
    .input(
      z.object({
        sport: z.enum(["football", "cricket", "basketball", "tennis"]),
        league: z.string(),
        leagueIcon: z.string(),
        teamAName: z.string(),
        teamAShortName: z.string(),
        teamALogo: z.string(),
        teamAColor: z.string(),
        teamBName: z.string(),
        teamBShortName: z.string(),
        teamBLogo: z.string(),
        teamBColor: z.string(),
        oddsHome: z.number(),
        oddsDraw: z.number(),
        oddsAway: z.number(),
        startTime: z.string(),
        isFeatured: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("sports_matches").insert({
        id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sport: input.sport,
        league: input.league,
        league_icon: input.leagueIcon,
        team_a_name: input.teamAName,
        team_a_short_name: input.teamAShortName,
        team_a_logo: input.teamALogo,
        team_a_color: input.teamAColor,
        team_b_name: input.teamBName,
        team_b_short_name: input.teamBShortName,
        team_b_logo: input.teamBLogo,
        team_b_color: input.teamBColor,
        score_a: null,
        score_b: null,
        odds_home: input.oddsHome,
        odds_draw: input.oddsDraw,
        odds_away: input.oddsAway,
        status: "upcoming",
        start_time: input.startTime,
        is_featured: input.isFeatured,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
