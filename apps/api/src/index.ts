import { createApp } from "./app.js";
import { ensureAttachmentsRoot } from "./lib/attachments-storage.js";

const app = createApp();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

await ensureAttachmentsRoot();

app.listen(port, "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
});
