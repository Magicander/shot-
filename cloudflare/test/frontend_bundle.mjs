// Test bundla interfejsu: node cloudflare/test/frontend_bundle.mjs
// Generuje frontend_bundle.js (bez quiz.db) i sprawdza, że Worker oddaje pliki zgodne z repo.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CF = join(HERE, "..");
const ROOT = join(CF, "..");

const gen = spawnSync("python3", [join(ROOT, "deploy_cloudflare.py"), "--write-frontend-bundle"], {
  cwd: ROOT, encoding: "utf8",
});
if (gen.status !== 0) {
  console.error(gen.stdout, gen.stderr);
  process.exit(gen.status || 1);
}
process.stdout.write(gen.stdout);

const { FRONTEND, FRONTEND_ETAG, frontendBody, frontendResponse, FRONTEND_BLOCKED } = await import("../src/frontend.js");

let OK = 0;
const check = (c, msg) => {
  if (!c) { console.log("FAIL: " + msg); process.exit(1); }
  OK++;
  console.log("  ok ", msg);
};

const read = name => readFileSync(join(ROOT, "static", name), "utf8");

check(FRONTEND["/static/game.js"] === read("game.js"), "bundle game.js = static/game.js z repo");
check(FRONTEND["/static/index.html"] === read("index.html"), "bundle index.html = static/index.html z repo");
check(FRONTEND["/static/style.css"] === read("style.css"), "bundle style.css zgodny z repo");
check(FRONTEND["/static/i18n.js"] === read("i18n.js"), "bundle i18n.js zgodny z repo");
check(FRONTEND["/static/admin.js"] === read("admin.js"), "bundle admin.js zgodny z repo");
check(FRONTEND["/static/admin.html"] === read("admin.html"), "bundle admin.html zgodny z repo");
check(FRONTEND["/static/admin.css"] === read("admin.css"), "bundle admin.css zgodny z repo");
check(FRONTEND["/static/favicon.svg"] === read("favicon.svg"), "bundle favicon.svg zgodny z repo");
check(FRONTEND["/static/rt.js"].includes('KADR_RT = "ws"'), "rt.js w bundlu to wersja Cloudflare (ws)");
check(!FRONTEND["/static/rt.js"].includes('KADR_RT = "poll"'), "rt.js w bundlu nie jest wersją lokalną (poll)");
check(FRONTEND["/static/cloud-admin.html"].includes("url=/admin"), "cloud-admin.html przekierowuje do /admin");
check(!Object.keys(FRONTEND).some(k => k.includes("filmrun") || k.endsWith(".jpg") || k.endsWith(".png")),
  "bundle nie zawiera zdjęć ani Filmrun photos");
check(frontendBody("/static/game.js") === read("game.js"), "frontendBody(game.js) zgadza się z repo");
check(FRONTEND_BLOCKED.has("/static/index.html") && FRONTEND_BLOCKED.has("/static/admin.html"),
  "surowe /static/index.html i /static/admin.html są zablokowane (idą przez / i /admin)");

const game = frontendResponse(new Request("https://x/static/game.js"), "/static/game.js");
check(game && game.status === 200, "GET /static/game.js z bundla: 200");
check(game.headers.get("Content-Type").includes("javascript"), "game.js: Content-Type javascript");
check(game.headers.get("Cache-Control") === "no-cache", "game.js: Cache-Control no-cache");
const etag = game.headers.get("ETag");
check(etag && etag === FRONTEND_ETAG["/static/game.js"], "game.js: ETag z bundla");
const body = await game.text();
check(body === read("game.js"), "ciało odpowiedzi game.js = plik z repo");

const cached = frontendResponse(new Request("https://x/static/game.js", { headers: { "If-None-Match": etag } }), "/static/game.js");
check(cached && cached.status === 304, "If-None-Match: 304");

const style = frontendResponse(new Request("https://x/static/style.css"), "/static/style.css");
check(style && style.headers.get("Content-Type").includes("css") && (await style.text()) === read("style.css"),
  "GET /static/style.css z bundla, typ CSS, treść z repo");

const blocked = frontendResponse(new Request("https://x/static/index.html"), "/static/index.html");
check(blocked == null, "/static/index.html nie jest serwowane surowo (szablon tylko przez /)");

const miss = frontendResponse(new Request("https://x/static/filmrun/photos/x.jpg"), "/static/filmrun/photos/x.jpg");
check(miss == null, "zdjęcie Filmrun nie jest w bundlu (zostaje ASSETS)");

const redir = frontendResponse(new Request("https://x/static/cloud-admin.html"), "/static/cloud-admin.html");
check(redir && redir.status === 200 && (await redir.text()).includes("url=/admin"),
  "/static/cloud-admin.html: redirect do /admin");

console.log(`\nOK: ${OK} sprawdzeń`);
