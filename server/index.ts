import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { Hub } from "./hub";

const port = Number(process.env.REALTIME_PORT ?? 3848);
const secret = process.env.INTERNAL_SECRET ?? "";
const hub = new Hub();

const app = express();
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/internal/broadcast", (request, response) => {
  if (!secret || request.header("x-internal-secret") !== secret) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  const houseId = request.body?.houseId;
  if (typeof houseId !== "string" || !houseId) {
    response.status(400).json({ error: "Missing house" });
    return;
  }
  void hub.refresh(houseId);
  response.json({ ok: true });
});

const server = createServer(app);
const sockets = new WebSocketServer({ server, path: "/socket" });

sockets.on("connection", (socket) => {
  hub.attach(socket);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`JojoTeams realtime listening on ${port}`);
});
