N="/c/Users/ADMIN/AppData/Local/Temp/claude/7638f03ea21d6c99/618e8698-c2be-49e1-ad2c-bcfb82bad6ab/scratchpad"; R="/c/Users/ADMIN/Desktop/Consultec Projects/All Clean"
cd "$R" && cp index.html app.js privacidad.html privacidad.js manifest.json icon.svg sw.js "$N/emu/www/" && cd "$N/emu/www" && python - <<'PY'
s=open('app.js',encoding='utf-8').read()
for a,b in [('fb = firebase.firestore();','fb = firebase.firestore(); fb.useEmulator("127.0.0.1", 8080);'),
            ('fbAuth = firebase.auth();','fbAuth = firebase.auth(); fbAuth.useEmulator("http://127.0.0.1:9099");'),
            ('\n})();\nif("serviceWorker" in navigator)','\nwindow.__ev = code => eval(code); // SOLO EN LA COPIA DE PRUEBAS\n})();\nif("serviceWorker" in navigator)')]:
    assert a in s, a; s=s.replace(a,b,1)
s=s.replace('const sa = sec.auth();','const sa = sec.auth(); try{ sa.useEmulator("http://127.0.0.1:9099"); }catch(e){}')
open('app.js','w',encoding='utf-8').write(s)
PY
