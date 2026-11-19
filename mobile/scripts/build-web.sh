#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/www
if [[ -n "${ZIG:-}" ]]; then cc=("$ZIG" c++ -target wasm32-freestanding); else cc=("${CLANGXX:-clang++}" --target=wasm32-unknown-unknown); fi
"${cc[@]}" -std=c++17 -Oz -nostdlib -fno-exceptions -fno-rtti -fno-stack-protector -ffreestanding -Wl,--no-entry -Wl,--export-memory -Wl,--export=dv_buffer -Wl,--export=dv_capacity -Wl,--export=dv_path -Wl,--export=dv_scan -Wl,--export=dv_zip_tail -Wl,--export=dv_entry core/vault.cpp -o build/www/vault.wasm
cp public/* build/www/
# Ruby2JS is a build tool only. The trusted Ruby source is compiled ahead of time.
node --input-type=commonjs <<'JS'
const fs=require('node:fs'), r=require('@ruby2js/ruby2js');
const imports=`import {Capacitor} from '@capacitor/core';import {Filesystem,Directory} from '@capacitor/filesystem';import {Browser} from '@capacitor/browser';import {Share} from '@capacitor/share';import {BlobReader,BlobWriter,ZipReader,ZipWriter,configure} from '@zip.js/zip.js';import {openDB} from 'idb';\n`;
// The Node distribution's Opal parser counts characters instead of UTF-8 bytes in
// interpolated string ranges. Protect localized literal text during compilation.
let compiled=imports;
for(const f of fs.readdirSync('src').filter(f=>f.endsWith('.rb')).sort()) {
  const cache='build/'+f+'.mjs';const source=fs.readFileSync('src/'+f,'utf8');
  if(/UQ\d+Q/.test(source)) throw Error('Reserved build marker in '+f);
  const key=require('crypto').createHash('sha256').update(fs.readFileSync('scripts/build-web.sh')).update(source).digest('hex');
  if(fs.existsSync(cache)&&fs.readFileSync(cache,'utf8').startsWith('// '+key+'\n')) {compiled+=fs.readFileSync(cache,'utf8');continue;}
  const literals=[];const ascii=source.replace(/[^\x00-\x7f]+/g,t=>`UQ${literals.push(t)-1}Q`);
  try {const generated='// '+key+'\n'+r.convert(ascii,{eslevel:2022,filters:['functions'],exclude:['delete'],comparison:'identity'}).toString().replace(/UQ(\d+)Q/g,(_,i)=>literals[+i])+';\n';fs.writeFileSync(cache,generated);compiled+=generated;}
  catch(e){console.error('Ruby compile error in '+f+':',e.message);process.exit(1)}
}
fs.writeFileSync('build/pocket.mjs',compiled);
JS
./node_modules/.bin/esbuild build/pocket.mjs --bundle --minify --platform=browser --target=chrome110 --outfile=build/www/pocket.js --legal-comments=eof
