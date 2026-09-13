import { createWorkBuddyCloud } from "@tencent-ai/workbuddy-cloud-sdk";
import { writeFileSync } from "node:fs";

const EP = "https://design-history-quiz.app.workbuddy.host";
const KEY = "wbpk_9X3KgaRcQgixFDDByZ7Mfp_YnDcKRIARtK8vhv1T0IVxKhk7XSvYsrl";
const out = [];

// 1) 站点可达性
try {
  const r = await fetch(EP + "/");
  const html = await r.text();
  out.push(`index.html ${r.status} ${html.length}B`);
  const m = html.match(/src="([^"]+\.js)"/);
  if (m) {
    const jr = await fetch(new URL(m[1], EP + "/").href);
    out.push(`bundle.js ${jr.status} ${(await jr.text()).length}B`);
  }
} catch (e) { out.push("SITE_ERROR " + e.message); }

// 2) 云数据面（排行榜为公共只读，未登录也应能查）
try {
  const cloud = createWorkBuddyCloud({ endpoint: EP, publishableKey: KEY });
  const res = await cloud.database.from("progress").select("owner_id, nickname, answered, correct").limit(5);
  out.push("db.status ok, rows=" + (Array.isArray(res.data) ? res.data.length : "n/a") + " error=" + (res.error ? JSON.stringify(res.error).slice(0, 200) : "none"));
} catch (e) {
  out.push("DB_ERROR " + e.message);
}

// 3) 未登录会话应为空（验证登录门）
try {
  const cloud2 = createWorkBuddyCloud({ endpoint: EP, publishableKey: KEY });
  const s = await cloud2.auth.getSession();
  out.push("anon session=" + (s.data ? "present(unexpected)" : "null(expected)"));
} catch (e) { out.push("AUTH_ERROR " + e.message); }

writeFileSync(process.argv[2], out.join("\n"), "utf8");
