import { defineConfig, loadEnv } from "vite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const maintFile = resolve(__dirname, "public/maint.json");

function readMaint() {
  if (!existsSync(maintFile)) {
    return { on: false, text: "Zoom Verse is in maintenance. We will be back soon.", owners: [] };
  }
  try {
    return JSON.parse(readFileSync(maintFile, "utf8"));
  } catch {
    return { on: false, text: "Zoom Verse is in maintenance. We will be back soon.", owners: [] };
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
          const state = readMaint();
          const owners = Array.isArray(state.owners) ? state.owners.map(String) : [];
          const isOwner = !!(uid && (owners.includes(uid) || owners.length === 0));
          return send(200, { on: !!state.on, text: state.text, isOwner, owners });
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
          if (!uid) return send(401, { error: "telegram_user_required" });
          const state = readMaint();
          const owners = Array.isArray(state.owners) ? state.owners.map(String) : [];
          const claiming = owners.length === 0;
          if (!claiming && !owners.includes(uid)) return send(403, { error: "not_owner" });
          const nextOwners = claiming ? [uid] : owners;
          if (!nextOwners.includes(uid)) nextOwners.push(uid);
          const next = {
            on: !!body.on,
            text: String(body.text || state.text || "").slice(0, 280),
            owners: nextOwners,
          };
          writeMaint(next);
          return send(200, { on: next.on, text: next.text, isOwner: true, owners: next.owners });
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
