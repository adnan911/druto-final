import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { assertStandalonePackage } from './starter-package-guard.mjs';
import { catalog, decimal } from '../starter-templates/cloudflare/src/catalog.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const starter=path.join(root,'starter-templates/cloudflare');
const meta=JSON.parse(await readFile(path.join(starter,'package.json'),'utf8'));
assertStandalonePackage(meta,JSON.parse(await readFile(path.join(starter,'package-lock.json'),'utf8')));
const sdkMeta=JSON.parse(await readFile(path.join(root,'sdk/druto-sdk/package.json'),'utf8'));
if(sdkMeta.version!=='0.2.0-testnet.3')throw new Error('Review starter compatibility before upgrading the bundled SDK');
const files=['package.json','package-lock.json','wrangler.jsonc','.gitignore','README.md','src/catalog.js','src/worker.js',
  'migrations/0001_orders.sql','public/index.html','public/style.css','public/tokens.css','public/app.js','public/setup.html'];
await mkdir(path.join(starter,'vendor/druto-sdk'),{recursive:true});
for(const [source,target] of [['dist/index.js','index.js'],['dist/index.d.ts','index.d.ts'],['LICENSE','LICENSE']]){
  await writeFile(path.join(starter,'vendor/druto-sdk',target),await readFile(path.join(root,'sdk/druto-sdk',source)));
  files.push(`vendor/druto-sdk/${target}`);
}
const zip=new JSZip();
for(const file of files)zip.file(`druto-cloudflare-starter/${file}`,await readFile(path.join(starter,file)),{date:new Date('2026-10-12T00:00:00Z'),createFolders:false});
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9}});
const sha256=createHash('sha256').update(bytes).digest('hex');
const name=`druto-cloudflare-starter-${meta.version}.zip`;
const output=path.join(root,'client/public/downloads');await mkdir(output,{recursive:true});
await writeFile(path.join(output,name),bytes);await writeFile(path.join(output,`${name}.sha256`),`${sha256}  ${name}\n`);
// Public visual preview is deliberately disconnected from order/payment APIs.
const preview=path.join(root,'client/public/starter-preview');await mkdir(preview,{recursive:true});
for(const file of ['index.html','setup.html','style.css','tokens.css','app.js']){
  let source=await readFile(path.join(starter,'public',file),'utf8');
  if(file.endsWith('.html'))source=source.replace('<body>','<body data-preview="true">').replaceAll('href="/','href="/starter-preview/').replaceAll('src="/','src="/starter-preview/');
  if(file==='style.css')source=source.replace("url('/tokens.css')","url('/starter-preview/tokens.css')");
  await writeFile(path.join(preview,file),source);
}
await writeFile(path.join(preview,'catalog.json'),JSON.stringify({products:catalog.map(p=>({...p,price:decimal(p.amountAtomic)})),checkoutEnabled:false}));
console.log(JSON.stringify({archive:name,bytes:bytes.length,sha256}));
