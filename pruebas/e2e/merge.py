import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
s = open('e2e_v1.mjs', encoding='utf-8').read()
head = s[:s.index('try {\n  console.log(`\\n=== ${which.toUpperCase()} ===`);')]
tail = s[s.index('} catch (e) { fail++; console.log("  FALLA excepción:", e.message); }'):]


def rep(t, a, b):
    assert a in t, a[:60]
    return t.replace(a, b, 1)


head = rep(head, 'import { spawn } from "node:child_process";', 'import { spawn, execSync } from "node:child_process";')
head = rep(head, 'const APP = "http://127.0.0.1:8097/";', '''const APP = "http://127.0.0.1:8096/";
const WWW = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\\/([A-Za-z]:)/, "$1")), "../emu/www");
let web = null;
const startWeb = async () => { web = spawn("python", ["-m", "http.server", "8096", "--bind", "127.0.0.1", "--directory", WWW], { stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { const r0 = await fetch(APP, { cache: "no-store" }); await r0.arrayBuffer(); return; } catch {} await new Promise(r => setTimeout(r, 250)); } };
const stopWeb = () => { try { execSync(`taskkill /PID ${web.pid} /T /F`, { stdio: "ignore" }); } catch {} };''')
head = rep(head, 'let ch, ev, nav, close;', 'let ch, ev, nav, close, cdp = null;\nawait startWeb();')
head = rep(head, '  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");', '  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); cdp = send;')
tail = rep(tail, 'finally { close();', 'finally { close(); stopWeb();')
open('e2e.mjs', 'w', encoding='utf-8').write(head + open('body.js', encoding='utf-8').read() + tail)
print('ok')
