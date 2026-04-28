import { createTRPCRouter } from "./create-context";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { giftsRouter } from "./routes/gifts";
import { streamsRouter } from "./routes/streams";
import { walletRouter } from "./routes/wallet";
import { rankingsRouter } from "./routes/rankings";
import { adminRouter } from "./routes/admin";
import { messagesRouter } from "./routes/messages";
import { storeRouter } from "./routes/store";
import { agenciesRouter } from "./routes/agencies";
import { pkRouter } from "./routes/pk";
import { contentRouter } from "./routes/content";

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