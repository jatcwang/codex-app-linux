import test from "node:test";
import assert from "node:assert/strict";

import { patchLinuxOpenTargetsSource } from "../scripts/lib/upstream-patches.mjs";

test("patchLinuxOpenTargetsSource adds Linux editor targets and exposes app paths", () => {
  const source = [
    "prefix",
    "var Cd=[td,rd,$u,au,Il,Uu,_d,od,Pl,_u,Ku,lu,Rl,mu,ru,cd,yu,pu,ad,fd,Tu,Eu,Du,Ou,ku,Au,ju,Mu,Yu]",
    "middle",
    "targets:[...o.map(({id:e,label:t,icon:n,kind:r,hidden:i})=>({id:e,target:e,label:t,icon:n,kind:r,hidden:i,available:s.has(e),default:c===e||void 0})),...p]",
    "suffix"
  ].join(";");

  const patched = patchLinuxOpenTargetsSource(source);

  assert.match(patched, /__codexLinuxVSCode=jl/);
  assert.match(patched, /__codexLinuxCursor=jl/);
  assert.match(patched, /__codexLinuxZed=jl/);
  assert.match(patched, /__codexLinuxNvim=jl/);
  assert.match(
    patched,
    /var Cd=\[__codexLinuxVSCode,__codexLinuxVSCodeInsiders,__codexLinuxCursor,__codexLinuxZed,__codexLinuxNvim,td,rd/
  );
  assert.match(
    patched,
    /appPath:process\.platform===`linux`&&r===`editor`&&s\.has\(e\)\?Ld\(\)\.get\(e\)\?\?null:null/
  );
});

test("patchLinuxOpenTargetsSource is idempotent for target definitions", () => {
  const source = [
    "var Cd=[td,rd,$u,au,Il,Uu,_d,od,Pl,_u,Ku,lu,Rl,mu,ru,cd,yu,pu,ad,fd,Tu,Eu,Du,Ou,ku,Au,ju,Mu,Yu]",
    "targets:[...o.map(({id:e,label:t,icon:n,kind:r,hidden:i})=>({id:e,target:e,label:t,icon:n,kind:r,hidden:i,available:s.has(e),default:c===e||void 0})),...p]"
  ].join(";");

  const patched = patchLinuxOpenTargetsSource(source);
  const repatched = patchLinuxOpenTargetsSource(patched);

  assert.equal(repatched.match(/__codexLinuxVSCode=jl/g).length, 1);
});
