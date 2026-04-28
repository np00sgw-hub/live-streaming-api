import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context.js";
import { supabase } from "../../lib/supabase.js";

export const storeRouter = createTRPCRouter({
  // VIP Packages
  listVipPackages: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("vip_packages")
      .select("*")
      .eq("is_active", true)
      .order("level", { ascending: true });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      level: v.level,
      price: v.price,
      duration: `${v.duration_days} days`,
      perks: v.perks,
      color: v.color,
    }));
  }),

  // Top-up Packages
  listTopupPackages: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("topup_packages")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((p) => ({
      id: p.id,
      coins: p.coins,
      price: Number(p.price),
      bonus: p.bonus,
      isPopular: p.is_popular,
    }));
  }),

  // Avatar Frames
  listAvatarFrames: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("avatar_frames")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      preview: f.preview,
      price: f.price,
      rarity: f.rarity,
      colors: f.colors,
      isAnimated: f.is_animated,
      requiredVipLevel: f.required_vip_level,
    }));
  }),

  // Entry Effects
  listEntryEffects: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("entry_effects")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      preview: e.preview,
      price: e.price,
      rarity: e.rarity,
      colors: e.colors,
      description: e.description,
      requiredVipLevel: e.required_vip_level,
    }));
  }),

  // Broadcast Themes
  listBroadcastThemes: publicProcedure.query(async () => {
    const { data, error } = await supabase
      .from("broadcast_themes")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      preview: t.preview,
      price: t.price,
      rarity: t.rarity,
      colors: t.colors,
      gradientColors: t.gradient_colors,
      description: t.description,
      requiredVipLevel: t.required_vip_level,
    }));
  }),

  // Emoji Sets
  listEmojiSets: publicProcedure.query(async () => {
    const { data: sets, error: setsError } = await supabase
      .from("emoji_sets")
      .select("*")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true });

    if (setsError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: setsError.message });

    const setsWithEmojis = await Promise.all(
      (sets ?? []).map(async (set) => {
        const { data: emojis } = await supabase
          .from("emojis")
          .select("*")
          .eq("set_id", set.id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        return {
          id: set.id,
          name: set.name,
          icon: set.icon,
          isEnabled: set.is_enabled,
          order: set.sort_order,
          createdAt: set.created_at,
          emojis: (emojis ?? []).map((e) => ({
            id: e.id,
            name: e.name,
            preview: e.preview,
            format: e.format,
            setId: e.set_id,
            order: e.sort_order,
          })),
        };
      })
    );

    return setsWithEmojis;
  }),

  // User-owned items
  getUserItems: protectedProcedure.query(async ({ ctx }) => {
    const [frames, effects, themes] = await Promise.all([
      supabase
        .from("user_avatar_frames")
        .select("*, avatar_frames(*)")
        .eq("user_id", ctx.userId),
      supabase
        .from("user_entry_effects")
        .select("*, entry_effects(*)")
        .eq("user_id", ctx.userId),
      supabase
        .from("user_broadcast_themes")
        .select("*, broadcast_themes(*)")
        .eq("user_id", ctx.userId),
    ]);

    return {
      frames: (frames.data ?? []).map((f) => ({
        id: f.frame_id,
        name: f.avatar_frames?.name,
        preview: f.avatar_frames?.preview,
        price: f.avatar_frames?.price,
        rarity: f.avatar_frames?.rarity,
        colors: f.avatar_frames?.colors,
        isAnimated: f.avatar_frames?.is_animated,
        requiredVipLevel: f.avatar_frames?.required_vip_level,
        isOwned: true,
        isEquipped: f.is_equipped,
      })),
      effects: (effects.data ?? []).map((e) => ({
        id: e.effect_id,
        name: e.entry_effects?.name,
        preview: e.entry_effects?.preview,
        price: e.entry_effects?.price,
        rarity: e.entry_effects?.rarity,
        colors: e.entry_effects?.colors,
        description: e.entry_effects?.description,
        requiredVipLevel: e.entry_effects?.required_vip_level,
        isOwned: true,
        isEquipped: e.is_equipped,
      })),
      themes: (themes.data ?? []).map((t) => ({
        id: t.theme_id,
        name: t.broadcast_themes?.name,
        preview: t.broadcast_themes?.preview,
        price: t.broadcast_themes?.price,
        rarity: t.broadcast_themes?.rarity,
        colors: t.broadcast_themes?.colors,
        gradientColors: t.broadcast_themes?.gradient_colors,
        description: t.broadcast_themes?.description,
        requiredVipLevel: t.broadcast_themes?.required_vip_level,
        isOwned: true,
        isEquipped: t.is_equipped,
      })),
    };
  }),

  // Purchase item
  purchaseItem: protectedProcedure
    .input(
      z.object({
        type: z.enum(["avatar_frame", "entry_effect", "broadcast_theme"]),
        itemId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("coins, diamonds")
        .eq("id", ctx.userId)
        .maybeSingle();

      if (userError || !user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      let table: string;
      let idColumn: string;
      if (input.type === "avatar_frame") {
        table = "avatar_frames";
        idColumn = "id";
      } else if (input.type === "entry_effect") {
        table = "entry_effects";
        idColumn = "id";
      } else {
        table = "broadcast_themes";
        idColumn = "id";
      }

      const { data: item, error: itemError } = await supabase
        .from(table)
        .select("*")
        .eq(idColumn, input.itemId)
        .maybeSingle();

      if (itemError || !item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });

      if (user.diamonds < item.price) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient diamonds" });
      }

      let userTable: string;
      let itemIdColumn: string;
      if (input.type === "avatar_frame") {
        userTable = "user_avatar_frames";
        itemIdColumn = "frame_id";
      } else if (input.type === "entry_effect") {
        userTable = "user_entry_effects";
        itemIdColumn = "effect_id";
      } else {
        userTable = "user_broadcast_themes";
        itemIdColumn = "theme_id";
      }

      // Check if already owned
      const { data: existing } = await supabase
        .from(userTable)
        .select("*")
        .eq("user_id", ctx.userId)
        .eq(itemIdColumn, input.itemId)
        .maybeSingle();

      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Already owned" });

      // Deduct diamonds
      await supabase
        .from("users")
        .update({ diamonds: user.diamonds - item.price })
        .eq("id", ctx.userId);

      // Add to user items
      await supabase.from(userTable).insert({
        user_id: ctx.userId,
        [itemIdColumn]: input.itemId,
        is_equipped: false,
        purchased_at: Date.now(),
      });

      return { success: true, newDiamonds: user.diamonds - item.price };
    }),

  // Equip item
  equipItem: protectedProcedure
    .input(
      z.object({
        type: z.enum(["avatar_frame", "entry_effect", "broadcast_theme"]),
        itemId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let userTable: string;
      let itemIdColumn: string;
      if (input.type === "avatar_frame") {
        userTable = "user_avatar_frames";
        itemIdColumn = "frame_id";
      } else if (input.type === "entry_effect") {
        userTable = "user_entry_effects";
        itemIdColumn = "effect_id";
      } else {
        userTable = "user_broadcast_themes";
        itemIdColumn = "theme_id";
      }

      // Unequip all items of this type
      await supabase
        .from(userTable)
        .update({ is_equipped: false })
        .eq("user_id", ctx.userId);

      // Equip selected item
      const { error } = await supabase
        .from(userTable)
        .update({ is_equipped: true })
        .eq("user_id", ctx.userId)
        .eq(itemIdColumn, input.itemId);

      if (error) throw new TRPCError({ code: "NOT_FOUND", message: "Item not owned" });

      return { success: true };
    }),

  // Admin: Create VIP Package
  createVipPackage: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        level: z.number().min(1).max(4),
        price: z.number().min(1),
        durationDays: z.number().min(1),
        perks: z.array(z.string()),
        color: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("vip_packages").insert({
        id: `vip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        level: input.level,
        price: input.price,
        duration_days: input.durationDays,
        perks: input.perks,
        color: input.color,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Admin: Create Top-up Package
  createTopupPackage: adminProcedure
    .input(
      z.object({
        coins: z.number().min(1),
        price: z.number().min(0),
        bonus: z.number().min(0),
        isPopular: z.boolean(),
        sortOrder: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("topup_packages").insert({
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        coins: input.coins,
        price: input.price,
        bonus: input.bonus,
        is_popular: input.isPopular,
        sort_order: input.sortOrder,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Admin: Create Avatar Frame
  createAvatarFrame: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        preview: z.string(),
        price: z.number().min(1),
        rarity: z.enum(["common", "rare", "epic", "legendary"]),
        colors: z.array(z.string()),
        isAnimated: z.boolean(),
        requiredVipLevel: z.number().min(0),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("avatar_frames").insert({
        id: `af_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        preview: input.preview,
        price: input.price,
        rarity: input.rarity,
        colors: input.colors,
        is_animated: input.isAnimated,
        required_vip_level: input.requiredVipLevel,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Admin: Create Entry Effect
  createEntryEffect: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        preview: z.string(),
        price: z.number().min(1),
        rarity: z.enum(["common", "rare", "epic", "legendary"]),
        colors: z.array(z.string()),
        description: z.string(),
        requiredVipLevel: z.number().min(0),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("entry_effects").insert({
        id: `ee_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        preview: input.preview,
        price: input.price,
        rarity: input.rarity,
        colors: input.colors,
        description: input.description,
        required_vip_level: input.requiredVipLevel,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Admin: Create Broadcast Theme
  createBroadcastTheme: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        preview: z.string(),
        price: z.number().min(1),
        rarity: z.enum(["common", "rare", "epic", "legendary"]),
        colors: z.array(z.string()),
        gradientColors: z.array(z.string()),
        description: z.string(),
        requiredVipLevel: z.number().min(0),
      })
    )
    .mutation(async ({ input }) => {
      const { error } = await supabase.from("broadcast_themes").insert({
        id: `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name,
        preview: input.preview,
        price: input.price,
        rarity: input.rarity,
        colors: input.colors,
        gradient_colors: input.gradientColors,
        description: input.description,
        required_vip_level: input.requiredVipLevel,
        is_active: true,
        created_at: Date.now(),
      });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
