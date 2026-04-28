import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";

// ── types ────────────────────────────────────────────────────────────────────

type UserRole = 'user' | 'admin' | 'owner';

// ── helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Detects user role based on database flags
 * Priority: Owner > Admin > User
 */
function detectRole(isAdmin: boolean, isAgency: boolean): UserRole {
  // Owner takes priority (agency users are owners)
  if (isAgency) {
    return 'owner';
  }
  // Admin (if not owner)
  if (isAdmin) {
    return 'admin';
  }
  // Default: regular user
  return 'user';
}

function generateSessionToken(userId: string, isAdmin: boolean, role: UserRole): string {
  const payload = { userId, isAdmin, role, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `hashed_${Math.abs(hash).toString(36)}_${password.length}`;
}

// ── public user projection ────────────────────────────────────────────────────

function publicUser(u: any, role?: UserRole) {
  return {
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    level: u.level ?? 1,
    gender: u.gender,
    isVip: u.is_vip ?? false,
    vipLevel: u.vip_level ?? 0,
    coins: u.coins ?? 0,
    diamonds: u.diamonds ?? 0,
    followers: u.followers ?? 0,
    following: u.following ?? 0,
    friends: u.friends ?? 0,
    visitors: u.visitors ?? 0,
    bio: u.bio ?? "",
    isAdmin: u.is_admin ?? false,
    role: role ?? detectRole(u.is_admin ?? false, u.is_agency ?? false),
  };
}

// ── router ────────────────────────────────────────────────────────────────────

export const authRouter = createTRPCRouter({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(30),
        email: z.string().email(),
        password: z.string().min(6).max(100),
        gender: z.enum(["male", "female"]),
      })
    )
    .mutation(async ({ input }) => {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", input.email)
        .maybeSingle();

      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Email already registered" });

      const id = generateId();
      const now = Date.now();

      const newUser = {
        id,
        name: input.name,
        email: input.email,
        password_hash: simpleHash(input.password),
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(input.name)}&size=150&background=FF2D55&color=fff`,
        level: 1,
        gender: input.gender,
        is_vip: false,
        vip_level: 0,
        coins: 100,
        diamonds: 0,
        followers: 0,
        following: 0,
        friends: 0,
        visitors: 0,
        bio: "",
        is_admin: false,
        is_agency: false,
        agency_name: "",
        special_id: "",
        frame_url: "",
        entry_effect: "",
        created_at: now,
        last_login: now,
        is_banned: false,
        ban_reason: "",
      };

      const { error } = await supabase.from("users").insert(newUser);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      // New user is always a regular 'user' role
      const role: UserRole = 'user';
      const token = generateSessionToken(id, false, role);
      console.log("[Auth] New user registered:", id, input.name);

      return { token, user: publicUser(newUser as unknown as Record<string, unknown>, role), role };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ input }) => {
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", input.email)
        .maybeSingle();

      if (error || !user || user.password_hash !== simpleHash(input.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      if (user.is_banned) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Account banned: ${user.ban_reason || "Contact support"}`,
        });
      }

      await supabase.from("users").update({ last_login: Date.now() }).eq("id", user.id);

      // Detect user role based on flags
      const role = detectRole(user.is_admin, user.is_agency);
      console.log("role", user.is_admin, user.is_agency)
      const token = generateSessionToken(user.id, user.is_admin, role);
      console.log("[Auth] User logged in:", user.id, user.name, `(role: ${role})`);

      return { token, user: publicUser(user, role), role };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", ctx.userId)
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
      isAdmin: user.is_admin,
      specialId: user.special_id,
      isAgency: user.is_agency,
      agencyName: user.agency_name,
      frameUrl: user.frame_url,
      entryEffect: user.entry_effect,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(30).optional(),
        bio: z.string().max(200).optional(),
        avatar: z.string().url().optional(),
        gender: z.enum(["male", "female"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.bio !== undefined) updates.bio = input.bio;
      if (input.avatar !== undefined) updates.avatar = input.avatar;
      if (input.gender !== undefined) updates.gender = input.gender;

      const { error } = await supabase.from("users").update(updates).eq("id", ctx.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Auth] Profile updated:", ctx.userId);
      return { success: true };
    }),
});