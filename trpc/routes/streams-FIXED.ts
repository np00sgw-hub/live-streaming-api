import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context.js";
import { supabase } from "../../lib/supabase.js";

const STALE_STREAM_THRESHOLD = 30 * 60 * 1000; // 30 minutes in milliseconds
const FRESH_STREAM_THRESHOLD = 30 * 1000; // 30 seconds - minimum age before blocking new stream

async function getConfig() {
  const { data } = await supabase.from("app_config").select("*").eq("id", 1).maybeSingle();
  return data;
}

/**
 * Auto-close stale streams from this user
 * Prevents orphaned "is_live=true" rows from crashed apps
 */
async function autoCloseStaleStreams(userId: string): Promise<{ closedCount: number }> {
  const NOW = Date.now();
  const STALE_TIME = NOW - STALE_STREAM_THRESHOLD;

  try {
    const { data: staleStreams } = await supabase
      .from("streams")
      .select("id")
      .eq("host_id", userId)
      .eq("is_live", true)
      .lt("updated_at", STALE_TIME);

    if (!staleStreams || staleStreams.length === 0) {
      return { closedCount: 0 };
    }

    const staleIds = staleStreams.map(s => s.id);

    const { error } = await supabase
      .from("streams")
      .update({ is_live: false, ended_at: NOW })
      .in("id", staleIds);

    if (error) {
      console.error("[Streams] Auto-close stale failed:", error);
      return { closedCount: 0 };
    }

    console.log("[Streams] Auto-closed stale streams:", staleIds);
    return { closedCount: staleIds.length };
  } catch (err) {
    console.error("[Streams] Auto-close error:", err);
    return { closedCount: 0 };
  }
}

export const streamsRouter = createTRPCRouter({
  listLive: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          country: z.string().optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(50).default(20),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;

      let query = supabase
        .from("streams")
        .select("*, users!streams_host_id_fkey(id, name, avatar, level, is_vip)")
        .eq("is_live", true)
        .order("viewer_count", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (input?.category) query = query.eq("category", input.category);
      if (input?.country) query = query.eq("country", input.country);

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      type StreamRow = {
        id: string;
        title: string;
        thumbnail: string;
        viewer_count: number;
        is_live: boolean;
        category: string;
        tags: string[];
        is_pk: boolean;
        country: string;
        gift_score: number;
        users: {
          id: string;
          name: string;
          avatar: string;
          level: number;
          is_vip: boolean;
        } | null;
      };

      const rows = (data ?? []) as StreamRow[];

      return rows
        .filter((s) => s.users !== null)
        .map((s) => ({
          id: s.id,
          host: {
            id: s.users!.id,
            name: s.users!.name,
            avatar: s.users!.avatar,
            level: s.users!.level,
            isVip: s.users!.is_vip,
          },
          title: s.title,
          thumbnail: s.thumbnail,
          viewerCount: s.viewer_count,
          isLive: s.is_live,
          category: s.category,
          tags: s.tags ?? [],
          isPK: s.is_pk,
          country: s.country,
          giftScore: s.gift_score,
        }));
    }),

  getActiveStream: protectedProcedure.query(async ({ ctx }) => {
    const { data: stream } = await supabase
      .from("streams")
      .select("*")
      .eq("host_id", ctx.userId)
      .eq("is_live", true)
      .maybeSingle();

    return stream;
  }),

  /**
   * START A LIVE STREAM
   * 
   * FIXED LOGIC (Production-safe):
   * 1. Auto-close any stale streams from this user (>30min old)
   * 2. Check if fresh active stream exists
   * 3. If fresh stream < 30s old, block with error (prevent double-start)
   * 4. Create new stream with heartbeat timestamp
   * 5. Handle unique constraint violation gracefully
   * 
   * IDEMPOTENT: Safe to call multiple times
   * RECOVERY: Auto-closes crashed app streams automatically
   */
  goLive: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        category: z.string(),
        tags: z.array(z.string()).max(5).optional(),
        thumbnail: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const NOW = Date.now();

      // ─────────────────────────────────────────────────────────
      // STEP 1: Auto-close stale streams from crashed apps
      // ─────────────────────────────────────────────────────────
      const { closedCount } = await autoCloseStaleStreams(ctx.userId);
      if (closedCount > 0) {
        console.log(
          "[Streams] Cleaned up",
          closedCount,
          "stale stream(s) before going live"
        );
      }

      // ─────────────────────────────────────────────────────────
      // STEP 2: Check if fresh active stream exists NOW
      // ─────────────────────────────────────────────────────────
      const { data: existing, error: checkErr } = await supabase
        .from("streams")
        .select("id, updated_at, started_at")
        .eq("host_id", ctx.userId)
        .eq("is_live", true)
        .maybeSingle();

      if (checkErr && checkErr.code !== "PGRST116") {
        // PGRST116 = "no rows returned" (expected when no active stream)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Database query failed: ${checkErr.message}`,
        });
      }

      // ─────────────────────────────────────────────────────────
      // STEP 3: If active stream exists, check if it's fresh
      // ─────────────────────────────────────────────────────────
      if (existing) {
        const lastUpdateMs = existing.updated_at || existing.started_at || 0;
        const ageMs = NOW - lastUpdateMs;

        // Only block if < 30 seconds old (actively streaming)
        if (ageMs < FRESH_STREAM_THRESHOLD) {
          console.warn(
            "[Streams] User tried to start 2nd stream while 1st still active (age:",
            ageMs,
            "ms)"
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already have an active stream. Please end it first.",
          });
        }

        // Stale but marked as live (>30s old) - auto-close it
        console.log(
          "[Streams] Auto-closing stale stream (age:",
          ageMs,
          "ms, streamId:",
          existing.id,
          ")"
        );
        await supabase
          .from("streams")
          .update({ is_live: false, ended_at: NOW })
          .eq("id", existing.id);
      }

      // ─────────────────────────────────────────────────────────
      // STEP 4: Create new stream with heartbeat tracking
      // ─────────────────────────────────────────────────────────
      const id = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const stream = {
        id,
        host_id: ctx.userId,
        title: input.title,
        thumbnail:
          input.thumbnail ??
          `https://ui-avatars.com/api/?name=${encodeURIComponent(input.title)}&size=400&background=FF2D55&color=fff`,
        viewer_count: 0,
        is_live: true,
        category: input.category,
        tags: input.tags ?? [],
        is_pk: false,
        country: "",
        gift_score: 0,
        started_at: NOW,
        updated_at: NOW, // ← Heartbeat timestamp
        ended_at: null,
      };

      // ─────────────────────────────────────────────────────────
      // STEP 5: Insert with error handling for unique constraint
      // ─────────────────────────────────────────────────────────
      const { error: insertErr } = await supabase
        .from("streams")
        .insert(stream);

      if (insertErr) {
        // Code 23505 = unique constraint violation
        if (insertErr.code === "23505") {
          console.warn(
            "[Streams] Unique constraint violation: user started 2nd stream concurrently"
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "You already have an active stream. Please end it first.",
          });
        }

        // Other insert errors
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create stream: ${insertErr.message}`,
        });
      }

      console.log("[Streams] User went live:", ctx.userId, input.title);
      return { streamId: id, stream };
    }),

  /**
   * END A LIVE STREAM
   * 
   * PRODUCTION-SAFE:
   * - Verify ownership
   * - Update heartbeat on end
   * - Handle missing streams gracefully
   */
  endStream: protectedProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const NOW = Date.now();

      // Fetch stream to verify ownership
      const { data: stream, error: fetchErr } = await supabase
        .from("streams")
        .select("host_id, is_live")
        .eq("id", input.streamId)
        .maybeSingle();

      if (fetchErr && fetchErr.code !== "PGRST116") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: fetchErr.message,
        });
      }

      if (!stream) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Stream not found",
        });
      }

      if (stream.host_id !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to end this stream",
        });
      }

      // Update stream: mark as ended + update heartbeat
      const { error: updateErr } = await supabase
        .from("streams")
        .update({
          is_live: false,
          ended_at: NOW,
          updated_at: NOW, // ← Update heartbeat on end
        })
        .eq("id", input.streamId);

      if (updateErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateErr.message,
        });
      }

      console.log("[Streams] Stream ended:", input.streamId);
      return { success: true };
    }),

  /**
   * HEARTBEAT MUTATION
   * 
   * Client calls this every 30 seconds while streaming
   * Updates the updated_at timestamp to mark stream as fresh
   * 
   * This prevents stale stream detection and keeps the stream marked as active
   * Non-blocking: if it fails (network), stream continues broadcasting
   */
  heartbeat: protectedProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const NOW = Date.now();

      // Update only if this user owns the stream and it's still live
      const { error } = await supabase
        .from("streams")
        .update({ updated_at: NOW })
        .eq("id", input.streamId)
        .eq("host_id", ctx.userId)
        .eq("is_live", true);

      if (error) {
        console.warn("[Streams] Heartbeat failed for stream:", input.streamId, error);
        // Don't throw - heartbeat failure shouldn't crash the broadcast
        return { success: false, error: error.message };
      }

      console.log("[Streams] Heartbeat received for stream:", input.streamId);
      return { success: true };
    }),

  getById: publicProcedure
    .input(z.object({ streamId: z.string() }))
    .query(async ({ input }) => {
      const { data: stream, error } = await supabase
        .from("streams")
        .select("*, users!streams_host_id_fkey(id, name, avatar, level, is_vip, vip_level)")
        .eq("id", input.streamId)
        .maybeSingle();

      if (error || !stream) throw new TRPCError({ code: "NOT_FOUND", message: "Stream not found" });

      const { users: host, ...rest } = stream as Record<string, unknown> & {
        users?: { id?: string; name?: string; avatar?: string; level?: number; is_vip?: boolean; vip_level?: number } | null;
      };
      return {
        ...rest,
        host: host
          ? { id: host.id, name: host.name, avatar: host.avatar, level: host.level, isVip: host.is_vip, vipLevel: host.vip_level }
          : null,
      };
    }),

  /**
   * ADMIN: Force end any stream (moderation)
   */
  forceEnd: adminProcedure
    .input(z.object({ streamId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const NOW = Date.now();

      const { error } = await supabase
        .from("streams")
        .update({
          is_live: false,
          ended_at: NOW,
          updated_at: NOW,
        })
        .eq("id", input.streamId);

      if (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Stream not found",
        });
      }

      console.log("[Admin] Force ended stream:", input.streamId, "reason:", input.reason);
      return { success: true };
    }),

  listPartyRooms: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          type: z.enum(["audio", "video", "all"]).optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(50).default(20),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;

      let query = supabase
        .from("party_rooms")
        .select("*, users!party_rooms_host_id_fkey(id, name, avatar, level)")
        .eq("is_active", true)
        .order("member_count", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (input?.category) query = query.eq("category", input.category);
      if (input?.type && input.type !== "all") query = query.eq("type", input.type);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((r: Record<string, unknown> & { users?: { id?: string; name?: string; avatar?: string; level?: number } | null }) => ({
        id: r.id,
        name: r.name,
        host: r.users ? { id: r.users.id, name: r.users.name, avatar: r.users.avatar, level: r.users.level } : null,
        coverImage: r.cover_image,
        memberCount: r.member_count,
        maxSeats: r.max_seats,
        type: r.type,
        isPrivate: r.is_private,
        category: r.category,
        backgroundTheme: r.background_theme,
      }));
    }),

  getZegoPublicConfig: publicProcedure.query(async () => {
    const cfg = await getConfig();
    return {
      appId: cfg?.zego_app_id ?? "",
      serverUrl: cfg?.zego_server_url ?? "",
      enabled: cfg?.zego_enabled ?? false,
      isConfigured:
        (cfg?.zego_app_id?.length ?? 0) > 0 &&
        (cfg?.zego_app_sign?.length ?? 0) > 0 &&
        (cfg?.zego_enabled ?? false),
    };
  }),

  getZegoToken: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const cfg = await getConfig();
      if (!cfg?.zego_enabled || !cfg.zego_app_id || !cfg.zego_app_sign) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ZegoCloud is not configured" });
      }

      const tokenPayload = {
        appId: cfg.zego_app_id,
        userId: ctx.userId,
        roomId: input.roomId,
        timestamp: Date.now(),
        expiresAt: Date.now() + 3600000,
      };
      const token = Buffer.from(JSON.stringify(tokenPayload)).toString("base64");
      console.log("[ZegoCloud] Token generated for user:", ctx.userId, "room:", input.roomId);

      return {
        token,
        appId: cfg.zego_app_id,
        serverUrl: cfg.zego_server_url,
        expiresAt: tokenPayload.expiresAt,
      };
    }),

  createPartyRoom: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        maxSeats: z.number().min(2).max(12),
        type: z.enum(["audio", "video"]),
        isPrivate: z.boolean(),
        category: z.string(),
        backgroundTheme: z.string().optional(),
        welcomeMessage: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const room = {
        id,
        name: input.name,
        host_id: ctx.userId,
        cover_image: `https://ui-avatars.com/api/?name=${encodeURIComponent(input.name)}&size=400&background=7B61FF&color=fff`,
        member_count: 1,
        max_seats: input.maxSeats,
        type: input.type,
        is_private: input.isPrivate,
        category: input.category,
        background_theme: input.backgroundTheme ?? "cosmic",
        welcome_message: input.welcomeMessage ?? "Welcome! Be nice & have fun 🎉",
        is_active: true,
        created_at: Date.now(),
      };

      const { error } = await supabase.from("party_rooms").insert(room);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Streams] Party room created:", id, input.name);
      return room;
    }),
});
