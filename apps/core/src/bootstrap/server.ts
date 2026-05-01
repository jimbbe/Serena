import { createServer, type ServerResponse } from "node:http";

type HealthResponse = {
  status: "ok";
  service: "serena-core";
  environment: string;
};

function sendJson(response: ServerResponse, statusCode: number, body: object): void {
  const payload = JSON.stringify(body);

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload).toString(),
  });
  response.end(payload);
}

export function createHttpServer(environment: string) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      const body: HealthResponse = {
        status: "ok",
        service: "serena-core",
        environment,
      };

      sendJson(res, 200, body);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  });
}
