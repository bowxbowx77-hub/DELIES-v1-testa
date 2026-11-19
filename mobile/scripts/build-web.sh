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
const imports=`import {Capacitor,CapacitorHttp} from '@capacitor/core';import {Filesystem,Directory} from '@capacitor/filesystem';import {Browser} from '@capacitor/browser';import {FileTransfer} from '@capacitor/file-transfer';import {Share} from '@capacitor/share';import {BlobReader,BlobWriter,ZipReader,ZipWriter,configure} from '@zip.js/zip.js';import {openDB} from 'idb';\n`;
let source=fs.readdirSync('src').filter(f=>f.endsWith('.rb')).sort().map(f=>fs.readFileSync('src/'+f,'utf8')).join('\n');
fs.writeFileSync('build/pocket.mjs',imports+r.convert(source,{eslevel:2022,filters:['functions'],comparison:'identity'}).toString());
JS
./node_modules/.bin/esbuild build/pocket.mjs --bundle --minify --platform=browser --target=chrome110 --outfile=build/www/pocket.js --legal-comments=eof
