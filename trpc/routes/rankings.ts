import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../create-context.js";
import { supabase } from "../../lib/supabase.js";

export const rankingsRouter = createTRPCRouter({
  top: publicProcedure
    .input(
      z.object({
        type: z.enum(["wealth", "charm", "level", "followers"]).default("wealth"),
        period: z.enum(["daily", "weekly", "monthly", "all"]).default("weekly"),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      // Map ranking type to the DB column to sort by
      const sortColumn: Record<string, string> = {
        wealth: "coins",   // best approximation without computed column
        charm: "diamonds",
        level: "level",
        followers: "followers",
      };

      const col = sortColumn[input.type];

      const { data, error } = await supabase
        .from("users")
        .select("id, name, avatar, level, is_vip, vip_level, coins, diamonds, followers")
        .eq("is_banned", false)
        .order(col, { ascending: false })
        .limit(input.limit);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      let sorted = data ?? [];

      // For wealth, re-sort in JS using the same formula as the original
      if (input.type === "wealth") {
        sorted = [...sorted].sort(
          (a, b) => (b.coins + b.diamonds * 10) - (a.coins + a.diamonds * 10)
        );
      }

      return sorted.map((u, i) => ({
        rank: i + 1,
        user: {
          id: u.id,
          name: u.name,
          avatar: u.avatar,
          level: u.level,
          isVip: u.is_vip,
          vipLevel: u.vip_level,
        },
        score:
          input.type === "wealth"
            ? u.coins + u.diamonds * 10
            : input.type === "charm"
            ? u.diamonds
            : input.type === "level"
            ? u.level
            : u.followers,
        change: (["up", "down", "same"] as const)[Math.floor(Math.random() * 3)],
      }));
    }),
});