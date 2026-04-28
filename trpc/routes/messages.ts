import * as z from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import { supabase } from "../../lib/supabase";

async function areFriends(userA: string, userB: string): Promise<boolean> {
  const { data } = await supabase
    .from("friendships")
    .select("user_a")
    .or(
      `and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`
    )
    .maybeSingle();
  return !!data;
}

async function addFriendship(userA: string, userB: string) {
  // Insert canonical pair (lower id first) to avoid duplicates
  const [a, b] = [userA, userB].sort();
  await supabase
    .from("friendships")
    .insert({ user_a: a, user_b: b, created_at: Date.now() })
    .throwOnError();
}

export const messagesRouter = createTRPCRouter({
  conversations: protectedProcedure.query(async ({ ctx }) => {
    const { data: msgs, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${ctx.userId},receiver_id.eq.${ctx.userId}`)
      .order("timestamp", { ascending: false });

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    const conversationMap = new Map<string, (typeof msgs)[number]>();
    for (const msg of msgs ?? []) {
      const otherId = msg.sender_id === ctx.userId ? msg.receiver_id : msg.sender_id;
      if (!conversationMap.has(otherId)) conversationMap.set(otherId, msg);
    }

    const otherIds = Array.from(conversationMap.keys());
    if (otherIds.length === 0) return [];

    const { data: otherUsers } = await supabase
      .from("users")
      .select("id, name, avatar, level")
      .in("id", otherIds);

    const userMap = new Map((otherUsers ?? []).map((u) => [u.id, u]));

    const conversations = await Promise.all(
      Array.from(conversationMap.entries()).map(async ([otherId, lastMsg]) => {
        const otherUser = userMap.get(otherId);
        const { count: unread } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", otherId)
          .eq("receiver_id", ctx.userId)
          .eq("is_read", false);

        const isFriend = await areFriends(ctx.userId, otherId);

        return {
          userId: otherId,
          userName: otherUser?.name ?? "Unknown",
          userAvatar: otherUser?.avatar ?? "",
          userLevel: otherUser?.level ?? 0,
          isOnline: Math.random() > 0.5,
          isFriend,
          lastMessage: lastMsg.text,
          lastMessageTime: lastMsg.timestamp,
          unreadCount: unread ?? 0,
        };
      })
    );

    conversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    return conversations;
  }),

  getMessages: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(100).default(50),
        before: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${ctx.userId},receiver_id.eq.${input.userId}),and(sender_id.eq.${input.userId},receiver_id.eq.${ctx.userId})`
        )
        .order("timestamp", { ascending: false })
        .limit(input.limit);

      if (input.before) query = query.lt("timestamp", input.before);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const unreadIds = (data ?? [])
        .filter((m) => m.receiver_id === ctx.userId && !m.is_read)
        .map((m) => m.id);

      if (unreadIds.length > 0) {
        await supabase.from("messages").update({ is_read: true }).in("id", unreadIds);
      }

      return [...(data ?? [])].reverse();
    }),

  send: protectedProcedure
    .input(
      z.object({
        receiverId: z.string(),
        text: z.string().min(1).max(1000),
        type: z.enum(["text", "image"]).default("text"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [senderResult, receiverResult] = await Promise.all([
        supabase.from("users").select("coins").eq("id", ctx.userId).maybeSingle(),
        supabase.from("users").select("id").eq("id", input.receiverId).maybeSingle(),
      ]);

      if (!senderResult.data) throw new TRPCError({ code: "NOT_FOUND", message: "Sender not found" });
      if (!receiverResult.data) throw new TRPCError({ code: "NOT_FOUND", message: "Receiver not found" });

      const friends = await areFriends(ctx.userId, input.receiverId);
      if (!friends) {
        if (senderResult.data.coins < 10) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient coins to message non-friend (costs 10 coins)" });
        }
        await supabase
          .from("users")
          .update({ coins: senderResult.data.coins - 10 })
          .eq("id", ctx.userId);
      }

      const msg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sender_id: ctx.userId,
        receiver_id: input.receiverId,
        text: input.text,
        type: input.type,
        gift_icon: "",
        gift_name: "",
        is_read: false,
        timestamp: Date.now(),
      };
      const { error } = await supabase.from("messages").insert(msg);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      console.log("[Messages] Sent:", ctx.userId, "->", input.receiverId);
      return { success: true, message: msg };
    }),

  sendFriendRequest: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const friends = await areFriends(ctx.userId, input.userId);
      if (friends) throw new TRPCError({ code: "BAD_REQUEST", message: "Already friends" });

      const { data: existing } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("from_id", ctx.userId)
        .eq("to_id", input.userId)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Friend request already sent" });

      await supabase.from("friend_requests").insert({
        id: `fr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        from_id: ctx.userId,
        to_id: input.userId,
        status: "pending",
        timestamp: Date.now(),
      });

      console.log("[Messages] Friend request:", ctx.userId, "->", input.userId);
      return { success: true };
    }),

  respondFriendRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        action: z.enum(["accept", "reject"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: request, error } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("id", input.requestId)
        .eq("to_id", ctx.userId)
        .maybeSingle();
      if (error || !request) throw new TRPCError({ code: "NOT_FOUND", message: "Friend request not found" });
      if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request already processed" });

      if (input.action === "accept") {
        await supabase.from("friend_requests").update({ status: "accepted" }).eq("id", input.requestId);
        await addFriendship(request.from_id, request.to_id);

        const [fromUser, toUser] = await Promise.all([
          supabase.from("users").select("friends").eq("id", request.from_id).maybeSingle(),
          supabase.from("users").select("friends").eq("id", request.to_id).maybeSingle(),
        ]);
        await Promise.all([
          fromUser.data &&
            supabase.from("users").update({ friends: fromUser.data.friends + 1 }).eq("id", request.from_id),
          toUser.data &&
            supabase.from("users").update({ friends: toUser.data.friends + 1 }).eq("id", request.to_id),
        ]);
      } else {
        await supabase.from("friend_requests").update({ status: "rejected" }).eq("id", input.requestId);
      }

      console.log("[Messages] Friend request", input.action, ":", input.requestId);
      return { success: true };
    }),

  friendRequests: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("*, users!friend_requests_from_id_fkey(id, name, avatar, level)")
      .eq("to_id", ctx.userId)
      .eq("status", "pending");

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    return (data ?? []).map((r: Record<string, unknown> & { users?: { id?: string; name?: string; avatar?: string; level?: number } | null }) => ({
      id: r.id,
      user: r.users ?? null,
      timestamp: r.timestamp,
    }));
  }),

  friends: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabase
      .from("friendships")
      .select("user_a, user_b")
      .or(`user_a.eq.${ctx.userId},user_b.eq.${ctx.userId}`);

    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    const friendIds = (data ?? []).map((f) =>
      f.user_a === ctx.userId ? f.user_b : f.user_a
    );
    if (friendIds.length === 0) return [];

    const { data: friends } = await supabase
      .from("users")
      .select("id, name, avatar, level, is_vip")
      .in("id", friendIds);

    return (friends ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      avatar: f.avatar,
      level: f.level,
      isVip: f.is_vip,
      isOnline: Math.random() > 0.5,
    }));
  }),
});