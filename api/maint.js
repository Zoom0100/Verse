import { head, put } from "@vercel/blob";

export const config = { runtime: "nodejs" };

const PATH = "zv-maint.json";
const OWNER_IDS = new Set(
  ["8144744644", ...(process.env.ADMIN_TG_IDS || "").split(",")]
    .map((s) => String(s).trim())
    .filter(Boolean),
);
const OWNER_NAMES = new Set(["zoom0100"]);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function emptyState() {
  return {
    on: false,
    text: "Zoom Verse is in maintenance. Only the owner can enter.",
    owners: ["8144744644"],
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

function isAdmin(uid, username) {
  if (uid && OWNER_IDS.has(String(uid))) return true;
  if (username && OWNER_NAMES.has(String(username).replace(/^@/, "").toLowerCase())) return true;
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
    const username = String(req.query?.username || "").replace(/^@/, "").toLowerCase();
    res.status(200).json({
      on: state.on,
      text: state.text,
      isOwner: isAdmin(uid, username),
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
    const username = String(body.username || body.name || "").replace(/^@/, "").toLowerCase();
    if (!isAdmin(uid, username)) {
      res.status(403).json({ error: "not_owner" });
      return;
    }

    const state = await readState();
    const next = {
      on: !!body.on,
      text: String(body.text || state.text || emptyState().text).slice(0, 280),
      owners: ["8144744644"],
    };
    await writeState(next);
    res.status(200).json({
      on: next.on,
      text: next.text,
      isOwner: true,
    });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
