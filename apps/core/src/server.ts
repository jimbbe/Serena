import { createServer, type ServerResponse } from "node:http";

type HealthResponse = {
  status: "ok";
  service: "serena-core";
  environment: string;
};

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const appEnv = process.env.APP_ENV ?? "local";

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}

function sendJson(response: ServerResponse, statusCode: number, body: object): void {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload).toString(),
  });
  response.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const body: HealthResponse = {
      status: "ok",
      service: "serena-core",
      environment: appEnv,
    };

    sendJson(res, 200, body);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  console.log(`serena-core listening on http://${host}:${port}`);
});
