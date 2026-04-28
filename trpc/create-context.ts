import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const authHeader = opts.req.headers.get("authorization");
  let userId: string | null = null;
  let isAdmin = false;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
      userId = decoded.userId ?? null;
      isAdmin = decoded.isAdmin ?? false;
      console.log("[tRPC Context] Authenticated user:", userId, "isAdmin:", isAdmin);
    } catch {
      console.log("[tRPC Context] Invalid token");
    }
  }

  return { req: opts.req, userId, isAdmin };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, isAdmin: true as const } });
});