import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertStandalonePackage } from './starter-package-guard.mjs';
const read=(name:string)=>JSON.parse(readFileSync(`starter-templates/cloudflare/${name}`,'utf8'));
describe('standalone starter archive dependency guard',()=>{
  it('accepts the shipped manifest and registry lockfile',()=>{
    expect(()=>assertStandalonePackage(read('package.json'),read('package-lock.json'))).not.toThrow();
  });
  it('rejects the accidental parent repository dependency even with a matching lockfile',()=>{
    const meta=read('package.json'),lock=read('package-lock.json');
    meta.dependencies={'druto-platform':'file:../..'};lock.packages[''].dependencies=meta.dependencies;
    expect(()=>assertStandalonePackage(meta,lock)).toThrow('pinned registry');
  });
  it.each(['link','outside','remote'])('rejects a transitive %s dependency',kind=>{
    const lock=read('package-lock.json');
    if(kind==='link')lock.packages['node_modules/hidden']={link:true,resolved:'../..'};
    if(kind==='outside')lock.packages['../..']={};
    if(kind==='remote')lock.packages['node_modules/hidden']={resolved:'https://unreviewed.invalid/code.tgz'};
    expect(()=>assertStandalonePackage(read('package.json'),lock)).toThrow();
  });
  it('rejects a stale lockfile version',()=>{
    const lock=read('package-lock.json');lock.version='0.0.0';
    expect(()=>assertStandalonePackage(read('package.json'),lock)).toThrow('identity mismatch');
  });
});
