import { buildApp } from "./app.js";
import { config } from "./config/index.js";

const app = buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
