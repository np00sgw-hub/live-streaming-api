import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context.js";
import { supabase } from "../../lib/supabase.js";

async function getConfig() {
  const { data } = await supabase.from("app_config").select("*").eq("id", 1).maybeSingle();
  return data;
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
      const { data: existing } = await supabase
        .from("streams")
        .select("id")
        .eq("host_id", ctx.userId)
        .eq("is_live", true)
        .maybeSingle();

      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "You already have an active stream" });

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
        started_at: Date.now(),
        ended_at: null,
      };

      const { error } = await supabase.from("streams").insert(stream);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Streams] User went live:", ctx.userId, input.title);
      return { streamId: id, stream };
    }),

  endStream: protectedProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: stream, error: fetchErr } = await supabase
        .from("streams")
        .select("host_id")
        .eq("id", input.streamId)
        .maybeSingle();

      if (fetchErr || !stream) throw new TRPCError({ code: "NOT_FOUND", message: "Stream not found" });
      if (stream.host_id !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });

      await supabase.from("streams").update({ is_live: false, ended_at: Date.now() }).eq("id", input.streamId);
      console.log("[Streams] Stream ended:", input.streamId);
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
        .update({ is_live: false, ended_at: Date.now() })
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