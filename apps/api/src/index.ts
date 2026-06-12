import { buildApp } from "./app";
import { env } from "./env";

const app = buildApp();

app
  .listen({ port: env.API_PORT, host: env.API_HOST })
  .then((address) => {
    app.log.info(`🧠 MindMatch API escuchando en ${address}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`Recibido ${signal}, cerrando...`);
    await app.close();
    process.exit(0);
  });
}
