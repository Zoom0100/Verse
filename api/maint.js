import { head, put } from "@vercel/blob";

export const config = { runtime: "nodejs" };

const PATH = "zv-maint.json";
const ADMIN_ENV = (process.env.ADMIN_TG_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function emptyState() {
  return {
    on: false,
    text: "Zoom Verse is in maintenance. We will be back soon.",
    owners: [],
  };
}

async function readState() {
  try {
    const meta = await head(PATH);
    const res = await fetch(meta.url, {
      headers: process.env.BLOB_READ_WRITE_TOKEN
        ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` }
        : undefined,
      cache: "no-store",
    });
    if (!res.ok) return emptyState();
    const data = await res.json();
    return {
      on: !!data.on,
      text: String(data.text || emptyState().text),
      owners: Array.isArray(data.owners) ? data.owners.map(String) : [],
    };
  } catch {
    return emptyState();
  }
}

async function writeState(state) {
  await put(PATH, JSON.stringify(state), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function isAdmin(uid, owners) {
  if (!uid) return false;
  const id = String(uid);
  if (ADMIN_ENV.includes(id)) return true;
  if (owners.map(String).includes(id)) return true;
  return false;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    const state = await readState();
    const uid = String(req.query?.uid || "");
    const owner = isAdmin(uid, state.owners) || (state.owners.length === 0 && !!uid);
    res.status(200).json({
      on: state.on,
      text: state.text,
      isOwner: owner,
      owners: state.owners,
    });
    return;
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};
    const uid = String(body.uid || "");
    if (!uid) {
      res.status(401).json({ error: "telegram_user_required" });
      return;
    }

    const state = await readState();
    const claiming = state.owners.length === 0;
    if (!claiming && !isAdmin(uid, state.owners)) {
      res.status(403).json({ error: "not_owner" });
      return;
    }

    const owners = claiming ? [uid] : state.owners.map(String);
    if (!owners.includes(uid)) owners.push(uid);

    const next = {
      on: !!body.on,
      text: String(body.text || state.text || emptyState().text).slice(0, 280),
      owners,
    };
    await writeState(next);
    res.status(200).json({
      on: next.on,
      text: next.text,
      isOwner: true,
      owners: next.owners,
    });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
