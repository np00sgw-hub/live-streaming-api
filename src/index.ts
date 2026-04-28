import "dotenv/config";

import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "../trpc/app-router";
import { createContext } from "../trpc/create-context";

const app = new Hono();

app.use("*", cors());

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/trpc",
    router: appRouter,
    createContext,
  })
);

app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "Live Streaming API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

const port = Number(process.env.PORT ?? 3000);
console.log(`Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });