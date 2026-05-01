export type AppEnv = {
  host: string;
  port: number;
  environment: string;
};

export function loadAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const host = env.HOST ?? "0.0.0.0";
  const port = Number.parseInt(env.PORT ?? "3000", 10);
  const environment = env.APP_ENV ?? "local";

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return { host, port, environment };
}
