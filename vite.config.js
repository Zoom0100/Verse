import { defineConfig, loadEnv } from "vite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const maintFile = resolve(__dirname, "public/maint.json");

const OWNER_TG_ID = "8144744644";
const OWNER_TG_NAME = "zoom0100";

function isOwner(uid, username) {
  if (uid && String(uid) === OWNER_TG_ID) return true;
  if (username && String(username).replace(/^@/, "").toLowerCase() === OWNER_TG_NAME) return true;
  return false;
}

function readMaint() {
  if (!existsSync(maintFile)) {
    return { on: false, text: "Zoom Verse is in maintenance. Only the owner can enter.", owners: [OWNER_TG_ID] };
  }
  try {
    return JSON.parse(readFileSync(maintFile, "utf8"));
  } catch {
    return { on: false, text: "Zoom Verse is in maintenance. Only the owner can enter.", owners: [OWNER_TG_ID] };
  }
}

function writeMaint(state) {
  writeFileSync(maintFile, `${JSON.stringify(state, null, 2)}\n`);
}

function maintPlugin() {
  return {
    name: "zv-maint-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/api/maint")) return next();

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        const send = (code, data) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        };

        if (req.method === "GET") {
          const q = new URL(url, "http://localhost");
          const uid = String(q.searchParams.get("uid") || "");
          const username = String(q.searchParams.get("username") || "").replace(/^@/, "").toLowerCase();
          const state = readMaint();
          return send(200, {
            on: !!state.on,
            text: state.text,
            isOwner: isOwner(uid, username),
          });
        }

        if (req.method === "POST") {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          let body = {};
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            body = {};
          }
          const uid = String(body.uid || "");
          const username = String(body.username || body.name || "").replace(/^@/, "").toLowerCase();
          if (!isOwner(uid, username)) return send(403, { error: "not_owner" });
          const state = readMaint();
          const next = {
            on: !!body.on,
            text: String(body.text || state.text || "").slice(0, 280),
            owners: [OWNER_TG_ID],
          };
          writeMaint(next);
          return send(200, { on: next.on, text: next.text, isOwner: true });
        }

        return send(405, { error: "method_not_allowed" });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), "");
  return {
    plugins: [maintPlugin()],
    server: {
      host: true,
      port: 5173,
    },
  };
});
