import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../create-context.js";
import { supabase } from "../../lib/supabase.js";

// ============================================================
// Helper Functions
// ============================================================

/**
 * Check if userA is following userB
 */
async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  if (followerId === followingId) return false;
  
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  
  return !!data;
}

/**
 * Check if two users are friends (mutual accepted friendship)
 */
async function areFriends(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false;
  
  const { data } = await supabase
    .from("friendships")
    .select("user_a")
    .or(
      `and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`
    )
    .maybeSingle();
  
  return !!data;
}

/**
 * Check if there's a pending friend request from sender to receiver
 */
async function hasPendingFriendRequest(fromId: string, toId: string): Promise<boolean> {
  const { data } = await supabase
    .from("friend_requests")
    .select("id")
    .eq("from_id", fromId)
    .eq("to_id", toId)
    .eq("status", "pending")
    .maybeSingle();
  
  return !!data;
}

/**
 * Get friend request status between two users
 */
async function getFriendRequestStatus(
  userA: string, 
  userB: string
): Promise<{ hasRequest: boolean; isReceiver: boolean; requestId?: string }> {
  // Check if userA sent request to userB
  const { data: sentRequest } = await supabase
    .from("friend_requests")
    .select("id, status")
    .eq("from_id", userA)
    .eq("to_id", userB)
    .in("status", ["pending", "accepted"])
    .maybeSingle();
  
  if (sentRequest) {
    return { 
      hasRequest: true, 
      isReceiver: false, 
      requestId: sentRequest.id 
    };
  }
  
  // Check if userB sent request to userA
  const { data: receivedRequest } = await supabase
    .from("friend_requests")
    .select("id, status")
    .eq("from_id", userB)
    .eq("to_id", userA)
    .in("status", ["pending", "accepted"])
    .maybeSingle();
  
  if (receivedRequest) {
    return { 
      hasRequest: true, 
      isReceiver: true, 
      requestId: receivedRequest.id 
    };
  }
  
  return { hasRequest: false, isReceiver: false };
}

/**
 * Record or update a profile visit
 */
async function recordVisit(visitorId: string, profileId: string): Promise<void> {
  if (visitorId === profileId) return;
  
  const now = Date.now();
  
  // Try to update existing record first
  const { data: existing } = await supabase
    .from("profile_visitors")
    .select("visit_count")
    .eq("visitor_id", visitorId)
    .eq("profile_id", profileId)
    .maybeSingle();
  
  if (existing) {
    await supabase
      .from("profile_visitors")
      .update({
        visit_count: existing.visit_count + 1,
        last_visit_at: now
      })
      .eq("visitor_id", visitorId)
      .eq("profile_id", profileId);
  } else {
    await supabase
      .from("profile_visitors")
      .insert({
        visitor_id: visitorId,
        profile_id: profileId,
        visit_count: 1,
        first_visit_at: now,
        last_visit_at: now
      });
  }
}

// ============================================================
// Router
// ============================================================

export const socialRouter = createTRPCRouter({
  // ============================================================
  // FOLLOW SYSTEM
  // ============================================================

  /**
   * Follow a user
   */
  follow: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.userId === input.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot follow yourself" });
      }

      // Check if target user exists
      const { data: targetUser, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("id", input.userId)
        .maybeSingle();

      if (userError || !targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Check if already following
      const alreadyFollowing = await isFollowing(ctx.userId, input.userId);
      if (alreadyFollowing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already following this user" });
      }

      // Create follow relationship
      const { error } = await supabase.from("follows").insert({
        follower_id: ctx.userId,
        following_id: input.userId,
        created_at: Date.now()
      });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      console.log("[Social] Follow:", ctx.userId, "->", input.userId);
      return { success: true };
    }),

  /**
   * Unfollow a user
   */
  unfollow: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", ctx.userId)
        .eq("following_id", input.userId);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      console.log("[Social] Unfollow:", ctx.userId, "->", input.userId);
      return { success: true };
    }),

  /**
   * Get followers list for a user
   */
  getFollowers: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ ctx, input }) => {
      // Record profile visit
      await recordVisit(ctx.userId, input.userId);

      const offset = (input.page - 1) * input.limit;

      const { data: follows, count, error } = await supabase
        .from("follows")
        .select("follower_id, created_at", { count: "exact" })
        .eq("following_id", input.userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (!follows || follows.length === 0) {
        return { items: [], total: 0, page: input.page, totalPages: 0 };
      }

      const followerIds = follows.map(f => f.follower_id);

      const { data: users } = await supabase
        .from("users")
        .select("id, name, avatar, level, is_vip, is_online")
        .in("id", followerIds);

      const userMap = new Map(users?.map(u => [u.id, u]) ?? []);

      // Check if current user follows each follower back
      const items = await Promise.all(
        follows.map(async (follow) => {
          const user = userMap.get(follow.follower_id);
          const isFollowingBack = await isFollowing(ctx.userId, follow.follower_id);
          const areFriendsWith = await areFriends(ctx.userId, follow.follower_id);

          return {
            id: follow.follower_id,
            name: user?.name ?? "Unknown",
            avatar: user?.avatar ?? "",
            level: user?.level ?? 0,
            isVip: user?.is_vip ?? false,
            isOnline: user?.is_online ?? false,
            followedAt: follow.created_at,
            isFollowingBack,
            areFriends: areFriendsWith
          };
        })
      );

      const total = count ?? 0;
      return {
        items,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit)
      };
    }),

  /**
   * Get following list for a user
   */
  getFollowing: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const { data: follows, count, error } = await supabase
        .from("follows")
        .select("following_id, created_at", { count: "exact" })
        .eq("follower_id", input.userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (!follows || follows.length === 0) {
        return { items: [], total: 0, page: input.page, totalPages: 0 };
      }

      const followingIds = follows.map(f => f.following_id);

      const { data: users } = await supabase
        .from("users")
        .select("id, name, avatar, level, is_vip, is_online")
        .in("id", followingIds);

      const userMap = new Map(users?.map(u => [u.id, u]) ?? []);

      // Check if each follows back and friendship status
      const items = await Promise.all(
        follows.map(async (follow) => {
          const user = userMap.get(follow.following_id);
          const followsBack = await isFollowing(follow.following_id, ctx.userId);
          const areFriendsWith = await areFriends(ctx.userId, follow.following_id);

          return {
            id: follow.following_id,
            name: user?.name ?? "Unknown",
            avatar: user?.avatar ?? "",
            level: user?.level ?? 0,
            isVip: user?.is_vip ?? false,
            isOnline: user?.is_online ?? false,
            followedAt: follow.created_at,
            followsBack,
            areFriends: areFriendsWith
          };
        })
      );

      const total = count ?? 0;
      return {
        items,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit)
      };
    }),

  // ============================================================
  // FRIEND SYSTEM
  // ============================================================

  /**
   * Send a friend request
   */
  sendFriendRequest: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.userId === input.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send friend request to yourself" });
      }

      // Check if target user exists
      const { data: targetUser, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("id", input.userId)
        .maybeSingle();

      if (userError || !targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Check if already friends
      const friends = await areFriends(ctx.userId, input.userId);
      if (friends) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already friends with this user" });
      }

      // Check if request already sent
      const hasPending = await hasPendingFriendRequest(ctx.userId, input.userId);
      if (hasPending) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Friend request already sent" });
      }

      // Check if other user sent request to us (auto-accept scenario)
      const otherPending = await hasPendingFriendRequest(input.userId, ctx.userId);
      if (otherPending) {
        // Auto-accept: Get the request ID first
        const { data: existingRequest } = await supabase
          .from("friend_requests")
          .select("id")
          .eq("from_id", input.userId)
          .eq("to_id", ctx.userId)
          .eq("status", "pending")
          .maybeSingle();

        if (existingRequest) {
          // Accept it immediately
          await supabase
            .from("friend_requests")
            .update({ status: "accepted" })
            .eq("id", existingRequest.id);

          // Add friendship
          const [a, b] = [ctx.userId, input.userId].sort();
          await supabase.from("friendships").insert({
            user_a: a,
            user_b: b,
            created_at: Date.now()
          });

          console.log("[Social] Auto-accepted friend request:", ctx.userId, "<->", input.userId);
          return { success: true, autoAccepted: true };
        }
      }

      // Create new friend request
      const { error } = await supabase.from("friend_requests").insert({
        id: `fr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        from_id: ctx.userId,
        to_id: input.userId,
        status: "pending",
        timestamp: Date.now()
      });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      console.log("[Social] Friend request sent:", ctx.userId, "->", input.userId);
      return { success: true, autoAccepted: false };
    }),

  /**
   * Respond to a friend request (accept/reject)
   */
  respondFriendRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        action: z.enum(["accept", "reject", "cancel"])
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: request, error } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("id", input.requestId)
        .maybeSingle();

      if (error || !request) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Friend request not found" });
      }

      // Validate permissions
      if (input.action === "cancel") {
        // Only sender can cancel
        if (request.from_id !== ctx.userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot cancel request you didn't send" });
        }
      } else {
        // Only receiver can accept/reject
        if (request.to_id !== ctx.userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to respond to this request" });
        }
      }

      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request already processed" });
      }

      if (input.action === "accept") {
        // Update request status
        await supabase
          .from("friend_requests")
          .update({ status: "accepted" })
          .eq("id", input.requestId);

        // Add to friendships
        const [a, b] = [request.from_id, request.to_id].sort();
        await supabase.from("friendships").insert({
          user_a: a,
          user_b: b,
          created_at: Date.now()
        });

        console.log("[Social] Friend request accepted:", input.requestId);
        return { success: true, action: "accepted" };
      } else {
        // Reject or cancel
        await supabase
          .from("friend_requests")
          .update({ status: input.action === "reject" ? "rejected" : "cancelled" })
          .eq("id", input.requestId);

        console.log("[Social] Friend request", input.action, ":", input.requestId);
        return { success: true, action: input.action };
      }
    }),

  /**
   * Get pending friend requests for current user
   */
  getFriendRequests: protectedProcedure
    .input(
      z.object({
        type: z.enum(["received", "sent"]).default("received"),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      let query = supabase
        .from("friend_requests")
        .select("*, users!friend_requests_from_id_fkey(id, name, avatar, level, is_vip), to_user:friend_requests_to_id_fkey(id, name, avatar, level, is_vip)", { count: "exact" })
        .eq("status", "pending");

      if (input.type === "received") {
        query = query.eq("to_id", ctx.userId);
      } else {
        query = query.eq("from_id", ctx.userId);
      }

      const { data, count, error } = await query
        .order("timestamp", { ascending: false })
        .range(offset, offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      const items = (data ?? []).map((r: any) => ({
        id: r.id,
        user: input.type === "received" 
          ? (r.users ?? null)  // from user
          : (r.to_user ?? null), // to user
        timestamp: r.timestamp,
        type: input.type
      }));

      const total = count ?? 0;
      return {
        items,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit)
      };
    }),

  /**
   * Get friends list
   */
  getFriends: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(), // If not provided, get current user's friends
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId ?? ctx.userId;
      const offset = (input.page - 1) * input.limit;

      const { data: friendships, count, error } = await supabase
        .from("friendships")
        .select("user_a, user_b, created_at", { count: "exact" })
        .or(`user_a.eq.${targetUserId},user_b.eq.${targetUserId}`)
        .order("created_at", { ascending: false })
        .range(offset, offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (!friendships || friendships.length === 0) {
        return { items: [], total: 0, page: input.page, totalPages: 0 };
      }

      // Get friend IDs (the other user in each pair)
      const friendIds = friendships.map(f => 
        f.user_a === targetUserId ? f.user_b : f.user_a
      );

      const { data: users } = await supabase
        .from("users")
        .select("id, name, avatar, level, is_vip, is_online, last_active")
        .in("id", friendIds);

      const userMap = new Map(users?.map(u => [u.id, u]) ?? []);

      const items = friendships.map(f => {
        const friendId = f.user_a === targetUserId ? f.user_b : f.user_a;
        const user = userMap.get(friendId);

        return {
          id: friendId,
          name: user?.name ?? "Unknown",
          avatar: user?.avatar ?? "",
          level: user?.level ?? 0,
          isVip: user?.is_vip ?? false,
          isOnline: user?.is_online ?? false,
          lastActive: user?.last_active ?? 0,
          friendsSince: f.created_at
        };
      });

      const total = count ?? 0;
      return {
        items,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit)
      };
    }),

  /**
   * Remove a friend
   */
  removeFriend: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [a, b] = [ctx.userId, input.userId].sort();

      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("user_a", a)
        .eq("user_b", b);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      console.log("[Social] Removed friendship:", ctx.userId, "<->", input.userId);
      return { success: true };
    }),

  // ============================================================
  // PROFILE VISITORS
  // ============================================================

  /**
   * Get profile visitors
   */
  getVisitors: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20)
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const { data: visits, count, error } = await supabase
        .from("profile_visitors")
        .select("visitor_id, visit_count, first_visit_at, last_visit_at", { count: "exact" })
        .eq("profile_id", ctx.userId)
        .order("last_visit_at", { ascending: false })
        .range(offset, offset + input.limit - 1);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (!visits || visits.length === 0) {
        return { items: [], total: 0, page: input.page, totalPages: 0 };
      }

      const visitorIds = visits.map(v => v.visitor_id);

      const { data: users } = await supabase
        .from("users")
        .select("id, name, avatar, level, is_vip, is_online")
        .in("id", visitorIds);

      const userMap = new Map(users?.map(u => [u.id, u]) ?? []);

      const items = await Promise.all(
        visits.map(async (visit) => {
          const user = userMap.get(visit.visitor_id);
          const followingStatus = await isFollowing(ctx.userId, visit.visitor_id);
          const friendsStatus = await areFriends(ctx.userId, visit.visitor_id);

          return {
            id: visit.visitor_id,
            name: user?.name ?? "Unknown",
            avatar: user?.avatar ?? "",
            level: user?.level ?? 0,
            isVip: user?.is_vip ?? false,
            isOnline: user?.is_online ?? false,
            visitCount: visit.visit_count,
            firstVisitAt: visit.first_visit_at,
            lastVisitAt: visit.last_visit_at,
            isFollowing: followingStatus,
            areFriends: friendsStatus
          };
        })
      );

      const total = count ?? 0;
      return {
        items,
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit)
      };
    }),

  // ============================================================
  // RELATIONSHIP STATUS
  // ============================================================

  /**
   * Get comprehensive relationship status between current user and another user
   * Used in profile popups, stream viewer, etc.
   */
  getRelationshipStatus: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.userId === input.userId) {
        return {
          isSelf: true,
          isFollowing: false,
          isFollower: false,
          areFriends: false,
          hasPendingRequest: false,
          isRequestReceiver: false,
          requestId: null
        };
      }

      const [
        followingStatus,
        followerStatus,
        friendsStatus,
        requestStatus
      ] = await Promise.all([
        isFollowing(ctx.userId, input.userId),
        isFollowing(input.userId, ctx.userId),
        areFriends(ctx.userId, input.userId),
        getFriendRequestStatus(ctx.userId, input.userId)
      ]);

      // Record visit if viewing another profile
      await recordVisit(ctx.userId, input.userId);

      return {
        isSelf: false,
        isFollowing: followingStatus,
        isFollower: followerStatus,
        areFriends: friendsStatus,
        hasPendingRequest: requestStatus.hasRequest,
        isRequestReceiver: requestStatus.isReceiver,
        requestId: requestStatus.requestId
      };
    }),

  /**
   * Bulk get relationship status for multiple users
   * Useful for lists (followers, following, etc.)
   */
  getBulkRelationshipStatus: protectedProcedure
    .input(z.object({ userIds: z.array(z.string()).max(100) }))
    .query(async ({ ctx, input }) => {
      const { userIds } = input;
      
      if (userIds.length === 0) {
        return {};
      }

      // Get all follows in one query
      const { data: follows } = await supabase
        .from("follows")
        .select("follower_id, following_id")
        .or(
          `and(follower_id.eq.${ctx.userId},following_id.in.(${userIds.join(",")})),` +
          `and(following_id.eq.${ctx.userId},follower_id.in.(${userIds.join(",")}))`
        );

      // Get all friendships in one query
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_a, user_b")
        .or(
          userIds.map(id => `and(user_a.eq.${ctx.userId},user_b.eq.${id}),and(user_a.eq.${id},user_b.eq.${ctx.userId})`).join(",")
        );

      // Get all pending requests
      const { data: requests } = await supabase
        .from("friend_requests")
        .select("id, from_id, to_id")
        .in("status", ["pending"])
        .or(
          `and(from_id.eq.${ctx.userId},to_id.in.(${userIds.join(",")})),` +
          `and(to_id.eq.${ctx.userId},from_id.in.(${userIds.join(",")}))`
        );

      const result: Record<string, {
        isFollowing: boolean;
        isFollower: boolean;
        areFriends: boolean;
        hasPendingRequest: boolean;
        isRequestReceiver: boolean;
        requestId: string | null;
      }> = {};

      for (const userId of userIds) {
        const isFollowing = follows?.some(
          f => f.follower_id === ctx.userId && f.following_id === userId
        ) ?? false;
        
        const isFollower = follows?.some(
          f => f.following_id === ctx.userId && f.follower_id === userId
        ) ?? false;

        const areFriends = friendships?.some(
          f => 
            (f.user_a === ctx.userId && f.user_b === userId) ||
            (f.user_a === userId && f.user_b === ctx.userId)
        ) ?? false;

        const pendingRequest = requests?.find(
          r => (r.from_id === ctx.userId && r.to_id === userId) ||
               (r.from_id === userId && r.to_id === ctx.userId)
        );

        result[userId] = {
          isFollowing,
          isFollower,
          areFriends,
          hasPendingRequest: !!pendingRequest,
          isRequestReceiver: pendingRequest?.to_id === ctx.userId,
          requestId: pendingRequest?.id ?? null
        };
      }

      return result;
    })
});

export { isFollowing, areFriends, hasPendingFriendRequest };
