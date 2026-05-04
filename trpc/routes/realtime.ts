import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../create-context.js';

// Types
export interface StoredComment {
  id: string;
  streamId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userLevel?: number;
  message: string;
  createdAt: number;
  deletedAt?: number;
}

export interface StreamLikeStats {
  streamId: string;
  totalLikes: number;
  updatedAt: number;
}

export interface StreamStorage {
  comments: Map<string, StoredComment>;
  likeStats: StreamLikeStats;
  likeHistory: Array<{ userId: string; count: number; timestamp: number }>;
}

// State
const streamStorageMap = new Map<string, StreamStorage>();
const userCommentRateLimiter = new Map<string, number[]>();
const userLikeRateLimiter = new Map<string, number[]>();

// Helpers
function getStreamStorage(streamId: string): StreamStorage {
  if (!streamStorageMap.has(streamId)) {
    streamStorageMap.set(streamId, {
      comments: new Map(),
      likeStats: { streamId, totalLikes: 0, updatedAt: Date.now() },
      likeHistory: [],
    });
  }
  return streamStorageMap.get(streamId)!;
}

function checkCommentRateLimit(userId: string): boolean {
  const now = Date.now();
  const userTimes = userCommentRateLimiter.get(userId) || [];
  const recent = userTimes.filter(t => now - t < 60000);
  userCommentRateLimiter.set(userId, [...recent, now]);
  return recent.length < 10;
}

function checkLikeRateLimit(userId: string): boolean {
  const now = Date.now();
  const userTimes = userLikeRateLimiter.get(userId) || [];
  const recent = userTimes.filter(t => now - t < 60000);
  userLikeRateLimiter.set(userId, [...recent, now]);
  return recent.length < 300;
}

// Router
export const realtimeRouter = createTRPCRouter({
  sendComment: publicProcedure
    .input(
      z.object({
        streamId: z.string().min(1),
        message: z.string().min(1).max(500),
        userName: z.string().optional(),
        userAvatar: z.string().optional(),
        userLevel: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error('Not authenticated');
      if (!checkCommentRateLimit(ctx.userId)) throw new Error('Rate limited');

      const { streamId, message, userName = 'User', userAvatar, userLevel } = input;
      const storage = getStreamStorage(streamId);

      const comment: StoredComment = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        streamId,
        userId: ctx.userId,
        userName,
        userAvatar,
        userLevel,
        message,
        createdAt: Date.now(),
      };

      storage.comments.set(comment.id, comment);

      return {
        id: comment.id,
        createdAt: comment.createdAt,
        userId: comment.userId,
        userName: comment.userName,
        message: comment.message,
      };
    }),

  deleteComment: publicProcedure
    .input(z.object({ streamId: z.string().min(1), commentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error('Not authenticated');

      const { streamId, commentId } = input;
      const storage = getStreamStorage(streamId);
      const comment = storage.comments.get(commentId);

      if (!comment) throw new Error('Comment not found');
      if (comment.userId !== ctx.userId && !ctx.isAdmin) {
        throw new Error('Not authorized');
      }

      comment.deletedAt = Date.now();
      return { success: true, commentId };
    }),

  getStreamComments: publicProcedure
    .input(
      z.object({
        streamId: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const { streamId, limit, offset } = input;
      const storage = getStreamStorage(streamId);

      const active = Array.from(storage.comments.values())
        .filter(c => !c.deletedAt)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(offset, offset + limit);

      return {
        comments: active,
        total: Array.from(storage.comments.values()).filter(c => !c.deletedAt).length,
      };
    }),

  sendLikes: publicProcedure
    .input(
      z.object({
        streamId: z.string().min(1),
        count: z.number().int().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new Error('Not authenticated');
      if (!checkLikeRateLimit(ctx.userId)) throw new Error('Rate limited');

      const { streamId, count } = input;
      const storage = getStreamStorage(streamId);

      storage.likeHistory.push({
        userId: ctx.userId,
        count,
        timestamp: Date.now(),
      });

      storage.likeStats.totalLikes += count;
      storage.likeStats.updatedAt = Date.now();

      return {
        success: true,
        totalLikes: storage.likeStats.totalLikes,
        count,
      };
    }),

  getStreamLikeStats: publicProcedure
    .input(z.object({ streamId: z.string().min(1) }))
    .query(async ({ input }) => {
      const storage = getStreamStorage(input.streamId);
      const now = Date.now();
      const likesInLastMinute = storage.likeHistory
        .filter(h => now - h.timestamp < 60000)
        .reduce((sum, h) => sum + h.count, 0);

      return {
        ...storage.likeStats,
        likesInLastMinute,
      };
    }),

  endStream: publicProcedure
    .input(z.object({ streamId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { streamId } = input;
      const storage = getStreamStorage(streamId);

      const stats = {
        streamId,
        totalComments: Array.from(storage.comments.values()).filter(c => !c.deletedAt).length,
        totalLikes: storage.likeStats.totalLikes,
        endedAt: Date.now(),
      };

      streamStorageMap.delete(streamId);
      return stats;
    }),
});
