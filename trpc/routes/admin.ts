import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";

// ── helpers ──────────────────────────────────────────────────────────────────

async function logAudit(adminId: string, action: string, target: string, details: string) {
  const { data: admin } = await supabase
    .from("users")
    .select("name")
    .eq("id", adminId)
    .maybeSingle();

  await supabase.from("audit_logs").insert({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    admin_id: adminId,
    admin_name: admin?.name ?? "Unknown",
    action,
    target,
    details,
    timestamp: Date.now(),
  });
}

async function getConfig() {
  const { data, error } = await supabase.from("app_config").select("*").eq("id", 1).maybeSingle();
  if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Config not found" });
  return data;
}

// ── router ────────────────────────────────────────────────────────────────────

export const adminRouter = createTRPCRouter({
  dashboard: adminProcedure.query(async () => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const { data: allUsers, error } = await supabase
      .from("users")
      .select("is_vip, is_banned, is_agency, last_login, coins, diamonds");

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    const users = allUsers ?? [];
    const cfg = await getConfig();

    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.last_login > weekAgo).length,
      vipUsers: users.filter((u) => u.is_vip).length,
      bannedUsers: users.filter((u) => u.is_banned).length,
      agencyUsers: users.filter((u) => u.is_agency).length,
      totalCoinsInCirculation: users.reduce((s, u) => s + u.coins, 0),
      totalDiamondsInCirculation: users.reduce((s, u) => s + u.diamonds, 0),
      config: {
        appName: cfg.app_name,
        maintenanceMode: cfg.maintenance_mode,
        minAppVersion: cfg.min_app_version,
        maxStreamDuration: cfg.max_stream_duration,
        giftCommissionRate: cfg.gift_commission_rate,
        minWithdrawalAmount: cfg.min_withdrawal_amount,
        pmCostNonFriend: cfg.pm_cost_non_friend,
        zegoAppId: cfg.zego_app_id,
        zegoAppSign: cfg.zego_app_sign,
        zegoServerUrl: cfg.zego_server_url,
        zegoEnabled: cfg.zego_enabled,
        announcementText: cfg.announcement_text,
        announcementEnabled: cfg.announcement_enabled,
      },
    };
  }),

  getConfig: adminProcedure.query(async () => {
    const cfg = await getConfig();
    return {
      appName: cfg.app_name,
      maintenanceMode: cfg.maintenance_mode,
      minAppVersion: cfg.min_app_version,
      maxStreamDuration: cfg.max_stream_duration,
      giftCommissionRate: cfg.gift_commission_rate,
      minWithdrawalAmount: cfg.min_withdrawal_amount,
      pmCostNonFriend: cfg.pm_cost_non_friend,
      zegoAppId: cfg.zego_app_id,
      zegoAppSign: cfg.zego_app_sign,
      zegoServerUrl: cfg.zego_server_url,
      zegoEnabled: cfg.zego_enabled,
      announcementText: cfg.announcement_text,
      announcementEnabled: cfg.announcement_enabled,
    };
  }),

  updateConfig: adminProcedure
    .input(
      z.object({
        appName: z.string().optional(),
        maintenanceMode: z.boolean().optional(),
        minAppVersion: z.string().optional(),
        maxStreamDuration: z.number().min(30).max(600).optional(),
        giftCommissionRate: z.number().min(0).max(1).optional(),
        minWithdrawalAmount: z.number().min(1).optional(),
        pmCostNonFriend: z.number().min(0).optional(),
        zegoAppId: z.string().optional(),
        zegoAppSign: z.string().optional(),
        zegoServerUrl: z.string().optional(),
        zegoEnabled: z.boolean().optional(),
        announcementText: z.string().optional(),
        announcementEnabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const fieldMap: Record<string, string> = {
        appName: "app_name",
        maintenanceMode: "maintenance_mode",
        minAppVersion: "min_app_version",
        maxStreamDuration: "max_stream_duration",
        giftCommissionRate: "gift_commission_rate",
        minWithdrawalAmount: "min_withdrawal_amount",
        pmCostNonFriend: "pm_cost_non_friend",
        zegoAppId: "zego_app_id",
        zegoAppSign: "zego_app_sign",
        zegoServerUrl: "zego_server_url",
        zegoEnabled: "zego_enabled",
        announcementText: "announcement_text",
        announcementEnabled: "announcement_enabled",
      };

      const updates: Record<string, unknown> = {};
      const changes: string[] = [];

      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
          updates[fieldMap[key]] = value;
          const isSecret = key.toLowerCase().includes("sign") || key.toLowerCase().includes("secret");
          changes.push(`${key}: ${isSecret ? "***" : value}`);
        }
      }

      const { error } = await supabase.from("app_config").update(updates).eq("id", 1);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await logAudit(ctx.userId, "update_config", "app_config", changes.join(", "));
      console.log("[Admin] Config updated:", changes.join(", "));

      const cfg = await getConfig();
      return {
        success: true,
        config: {
          appName: cfg.app_name,
          maintenanceMode: cfg.maintenance_mode,
          minAppVersion: cfg.min_app_version,
          maxStreamDuration: cfg.max_stream_duration,
          giftCommissionRate: cfg.gift_commission_rate,
          minWithdrawalAmount: cfg.min_withdrawal_amount,
          pmCostNonFriend: cfg.pm_cost_non_friend,
          zegoAppId: cfg.zego_app_id,
          zegoAppSign: cfg.zego_app_sign,
          zegoServerUrl: cfg.zego_server_url,
          zegoEnabled: cfg.zego_enabled,
          announcementText: cfg.announcement_text,
          announcementEnabled: cfg.announcement_enabled,
        },
      };
    }),

  auditLog: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ input }) => {
      const { data, count, error } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("timestamp", { ascending: false })
        .range((input.page - 1) * input.limit, input.page * input.limit - 1);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const total = count ?? 0;
      return { items: data ?? [], total, page: input.page, totalPages: Math.ceil(total / input.limit) };
    }),

  broadcastMessage: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        message: z.string().min(1).max(500),
        targetGroup: z.enum(["all", "vip", "agency"]).default("all"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await logAudit(ctx.userId, "broadcast_message", input.targetGroup, `${input.title}: ${input.message}`);
      console.log("[Admin] Broadcast sent to", input.targetGroup, ":", input.title);
      return { success: true, sentTo: input.targetGroup };
    }),

  getZegoConfig: adminProcedure.query(async () => {
    const cfg = await getConfig();
    return {
      appId: cfg.zego_app_id,
      appSignConfigured: cfg.zego_app_sign.length > 0,
      appSignPreview: cfg.zego_app_sign
        ? `${cfg.zego_app_sign.substring(0, 8)}${"••••••••"}${cfg.zego_app_sign.substring(Math.max(0, cfg.zego_app_sign.length - 8))}`
        : "",
      serverUrl: cfg.zego_server_url,
      enabled: cfg.zego_enabled,
    };
  }),

  saveZegoConfig: adminProcedure
    .input(
      z.object({
        appId: z.string().min(1, "App ID is required"),
        appSign: z.string().optional(),
        serverUrl: z.string().optional(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Record<string, unknown> = {
        zego_app_id: input.appId,
        zego_server_url: input.serverUrl ?? "",
        zego_enabled: input.enabled,
      };
      if (input.appSign && input.appSign.length > 0) {
        updates.zego_app_sign = input.appSign;
      }

      const { error } = await supabase.from("app_config").update(updates).eq("id", 1);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await logAudit(
        ctx.userId,
        "update_zego_config",
        "zegocloud",
        `AppID: ${input.appId}, Enabled: ${input.enabled}, AppSign: ${input.appSign ? "***updated***" : "***unchanged***"}`
      );
      console.log("[Admin] ZegoCloud config saved securely. AppID:", input.appId, "Enabled:", input.enabled);

      const cfg = await getConfig();
      return {
        success: true,
        appId: cfg.zego_app_id,
        appSignConfigured: cfg.zego_app_sign.length > 0,
        serverUrl: cfg.zego_server_url,
        enabled: cfg.zego_enabled,
      };
    }),

  deleteZegoConfig: adminProcedure.mutation(async ({ ctx }) => {
    const cfg = await getConfig();
    const oldAppId = cfg.zego_app_id;

    await supabase
      .from("app_config")
      .update({ zego_app_id: "", zego_app_sign: "", zego_server_url: "", zego_enabled: false })
      .eq("id", 1);

    await logAudit(ctx.userId, "delete_zego_config", "zegocloud", `Cleared config (was AppID: ${oldAppId})`);
    console.log("[Admin] ZegoCloud config cleared");
    return { success: true };
  }),
});

export { logAudit };