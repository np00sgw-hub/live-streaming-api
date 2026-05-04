import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context.js";
import { supabase } from "../../lib/supabase.js";

const STALE_STREAM_THRESHOLD = 30 * 60 * 1000; // 30 minutes in milliseconds
// ─── REMOVED: FRESH_STREAM_THRESHOLD ──────────────────────────────────────────
// This 30-second "freshness" block was causing the bug:
// After endStream sets is_live=false, if the user navigated back and tapped
// "Go Live" again within 30s, the old row (now is_live=false) was no longer
// returned by the `.eq("is_live", true)` query — so it should have been fine.
// The real culprit was the FRONTEND isCreatingStream ref not resetting on
// navigation back. But removing this threshold also prevents any edge-case
// where the ended stream row is somehow still returned.
// const FRESH_STREAM_THRESHOLD = 30 * 1000;

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
   * FIXED LOGIC:
   * 1. Auto-close any stale streams from this user (>30min with no heartbeat)
   * 2. Check if there is genuinely still an active (is_live=true) stream
   * 3. If yes — force-close it (handles crashed app / missed endStream call)
   * 4. Create the new stream
   *
   * KEY FIX: Removed the FRESH_STREAM_THRESHOLD check that was blocking
   * legitimate new streams after the user had properly ended the previous one.
   * A properly ended stream has is_live=false, so it won't appear in step 2.
   * The only time step 2 finds a live stream now is a genuine orphan (crash),
   * which we cleanly force-close before proceeding.
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
      // STEP 1: Auto-close stale streams (>30min no heartbeat)
      // ─────────────────────────────────────────────────────────
      const { closedCount } = await autoCloseStaleStreams(ctx.userId);
      if (closedCount > 0) {
        console.log("[Streams] Cleaned up", closedCount, "stale stream(s) before going live");
      }

      // ─────────────────────────────────────────────────────────
      // STEP 2: Check if an active stream still exists
      // ─────────────────────────────────────────────────────────
      // This only returns rows where is_live=true.
      // A properly ended stream (endStream called) has is_live=false → won't appear here.
      // Only genuinely orphaned streams (app crash, missed endStream) show up here.
      const { data: existing, error: checkErr } = await supabase
        .from("streams")
        .select("id, updated_at, started_at, created_at")
        .eq("host_id", ctx.userId)
        .eq("is_live", true)
        .maybeSingle();

      if (checkErr && checkErr.code !== "PGRST116") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Database query failed: ${checkErr.message}`,
        });
      }

      // ─────────────────────────────────────────────────────────
      // STEP 3: Force-close any orphaned active stream
      // ─────────────────────────────────────────────────────────
      // If we reach here with an existing live stream, it must be an orphan
      // (crash recovery). Close it unconditionally and proceed.
      // We no longer block based on age — if the user tapped "End Stream" and
      // came back to start a new one, is_live is already false and this block
      // is never entered.
      if (existing) {
        console.log(
          "[Streams] Found orphaned live stream, force-closing before new stream. streamId:",
          existing.id
        );
        await supabase
          .from("streams")
          .update({ is_live: false, ended_at: NOW, updated_at: NOW })
          .eq("id", existing.id);
      }

      // ─────────────────────────────────────────────────────────
      // STEP 4: Create new stream
      // ─────────────────────────────────────────────────────────
      const id = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const stream: Record<string, unknown> = {
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
        ended_at: null,
        created_at: NOW,
        updated_at: NOW,
      };

      // ─────────────────────────────────────────────────────────
      // STEP 5: Insert with unique-constraint guard
      // ─────────────────────────────────────────────────────────
      const { error: insertErr } = await supabase
        .from("streams")
        .insert(stream);

      if (insertErr) {
        // 23505 = unique_violation — two concurrent requests raced
        if (insertErr.code === "23505") {
          console.warn("[Streams] Unique constraint violation: concurrent goLive race");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already have an active stream. Please end it first.",
          });
        }

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
   * Sets is_live=false so the next goLive call won't see this stream
   * as an orphan and can proceed immediately.
   */
  endStream: protectedProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const NOW = Date.now();

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
        // Stream already gone — treat as success so the client can proceed
        console.warn("[Streams] endStream: stream not found (already ended?):", input.streamId);
        return { success: true };
      }

      if (stream.host_id !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to end this stream",
        });
      }

      const { error: updateErr } = await supabase
        .from("streams")
        .update({
          is_live: false,
          ended_at: NOW,
          updated_at: NOW,
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
   * Client calls this every 30 seconds while streaming.
   * Updates updated_at so stale detection keeps the stream fresh.
   * Non-blocking on failure.
   */
  heartbeat: protectedProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const NOW = Date.now();

      const { error } = await supabase
        .from("streams")
        .update({ updated_at: NOW })
        .eq("id", input.streamId)
        .eq("host_id", ctx.userId)
        .eq("is_live", true);

      if (error) {
        console.warn("[Streams] Heartbeat failed for stream:", input.streamId, error);
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

  forceEnd: adminProcedure
    .input(z.object({ streamId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const { error } = await supabase
        .from("streams")
        .update({ is_live: false, ended_at: Date.now(), updated_at: Date.now() })
        .eq("id", input.streamId);
      if (error) throw new TRPCError({ code: "NOT_FOUND", message: "Stream not found" });

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
      appSign: cfg?.zego_app_sign ?? "",
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