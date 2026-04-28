import { createTRPCRouter } from "./create-context.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { giftsRouter } from "./routes/gifts.js";
import { streamsRouter } from "./routes/streams.js";
import { walletRouter } from "./routes/wallet.js";
import { rankingsRouter } from "./routes/rankings.js";
import { adminRouter } from "./routes/admin.js";
import { messagesRouter } from "./routes/messages.js";
import { storeRouter } from "./routes/store.js";
import { agenciesRouter } from "./routes/agencies.js";
import { pkRouter } from "./routes/pk.js";
import { contentRouter } from "./routes/content.js";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  users: usersRouter,
  gifts: giftsRouter,
  streams: streamsRouter,
  wallet: walletRouter,
  rankings: rankingsRouter,
  admin: adminRouter,
  messages: messagesRouter,
  store: storeRouter,
  agencies: agenciesRouter,
  pk: pkRouter,
  content: contentRouter,
});

export type AppRouter = typeof appRouter;