// Stores votes in Upstash Redis (added via Vercel Marketplace).
// Each voter keeps a secret token in their browser; votes are stored under
// a hash of it, so nobody can overwrite someone else's votes.
const crypto = require("crypto");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "tulum:votes";

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return (await r.json()).result;
}

const hashId = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 24);
const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 40)) : []);

function clean(d) {
  if (!d || typeof d !== "object") return null;
  const out = {
    nick: str(d.nick, 30).trim(),
    breakfast: typeof d.breakfast === "string" ? str(d.breakfast, 40) : null,
    wed_pm: arr(d.wed_pm),
    thu_am: arr(d.thu_am),
    thu_pm: arr(d.thu_pm),
    suggestions: Array.isArray(d.suggestions)
      ? d.suggestions.slice(0, 30).filter((s) => s && typeof s.text === "string" && s.text.trim())
          .map((s) => ({ id: str(s.id, 40), text: s.text.trim().slice(0, 200), at: str(s.at, 40) }))
      : [],
    updatedAt: new Date().toISOString(),
  };
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) {
    return res.status(500).json({ error: "Storage not connected. Add Upstash Redis in the Vercel project's Storage tab, then redeploy." });
  }
  try {
    if (req.method === "GET") {
      const flat = (await redis(["HGETALL", KEY])) || [];
      const votes = {};
      for (let i = 0; i < flat.length; i += 2) {
        try { votes[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) {}
      }
      if (req.query && req.query.format === "csv") {
        const cols = ["nick", "breakfast", "wed_pm", "thu_am", "thu_pm", "suggestions", "updatedAt"];
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const rows = Object.values(votes).map((v) =>
          cols.map((c) => esc(c === "suggestions" ? (v.suggestions || []).map((s) => s.text).join(" | ")
            : Array.isArray(v[c]) ? v[c].join(", ") : v[c])).join(","));
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="tulum-votes.csv"');
        return res.status(200).send([cols.join(","), ...rows].join("\n"));
      }
      return res.status(200).json({ votes });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const token = body.token;
      if (typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token)) {
        return res.status(400).json({ error: "Bad voter token" });
      }
      const data = clean(body.data);
      if (!data) return res.status(400).json({ error: "Bad vote" });
      await redis(["HSET", KEY, hashId(token), JSON.stringify(data)]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "Storage error" });
  }
};
