import fs from "node:fs/promises";
import path from "node:path";

const openTargetAnchor = "var Cd=[td,rd,$u,au,Il,Uu,_d,od,Pl,_u,Ku,lu,Rl,mu,ru,cd,yu,pu,ad,fd,Tu,Eu,Du,Ou,ku,Au,ju,Mu,Yu]";
const openTargetMapAnchor = "targets:[...o.map(({id:e,label:t,icon:n,kind:r,hidden:i})=>({id:e,target:e,label:t,icon:n,kind:r,hidden:i,available:s.has(e),default:c===e||void 0})),...p]";

const linuxOpenTargetDefinitions = [
  "var __codexLinuxOpenTargetGotoArgs=(e,t)=>t?[`--goto`,`${e}:${t.line}:${t.column}`]:[e]",
  "__codexLinuxOpenTargetColonArgs=(e,t)=>t?[`${e}:${t.line}:${t.column}`]:[e]",
  "__codexLinuxOpenTargetTerminal=()=>{let e=process.env.TERMINAL?.trim();if(e&&W(e))return{command:W(e),args:e=>[`-e`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]};for(let e of [[`ghostty`,e=>[`-e`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]],[`kitty`,e=>[`-e`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]],[`alacritty`,e=>[`-e`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]],[`wezterm`,e=>[`start`,`--`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]],[`gnome-terminal`,e=>[`--`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]],[`konsole`,e=>[`-e`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]],[`xterm`,e=>[`-e`,process.env.SHELL?.trim()||`/bin/sh`,`-lc`,e]]]){let t=W(e[0]);if(t)return{command:t,args:e[1]}}return null}",
  "__codexLinuxOpenTargetNvimArgs=(e,t)=>t?[`+call cursor(${t.line},${t.column})`,e]:[e]",
  "__codexLinuxOpenTargetNvimCommand=(e,n,r)=>`${t.En(e)} ${t.Tn(__codexLinuxOpenTargetNvimArgs(n,r))}`",
  "__codexLinuxOpenTargetRunNvim=async({command:e,path:t,location:n})=>{let r=__codexLinuxOpenTargetTerminal();if(!r)throw Error(`No terminal emulator found for Neovim`);await al(r.command,r.args(__codexLinuxOpenTargetNvimCommand(e,t,n)))}",
  "__codexLinuxVSCode=jl({id:`vscode`,label:`VS Code`,icon:`apps/vscode.png`,kind:`editor`,linux:{detect:()=>W(`code`),args:__codexLinuxOpenTargetGotoArgs}})",
  "__codexLinuxVSCodeInsiders=jl({id:`vscodeInsiders`,label:`VS Code Insiders`,icon:`apps/vscode-insiders.png`,kind:`editor`,linux:{detect:()=>W(`code-insiders`),args:__codexLinuxOpenTargetGotoArgs}})",
  "__codexLinuxCursor=jl({id:`cursor`,label:`Cursor`,icon:`apps/cursor.png`,kind:`editor`,linux:{detect:()=>W(`cursor`),args:__codexLinuxOpenTargetGotoArgs}})",
  "__codexLinuxZed=jl({id:`zed`,label:`Zed`,icon:`apps/zed.png`,kind:`editor`,linux:{detect:()=>W(`zed`),args:__codexLinuxOpenTargetColonArgs}})",
  "__codexLinuxNvim=jl({id:`nvim`,label:`Neovim`,icon:`apps/terminal.png`,kind:`editor`,linux:{detect:()=>W(`nvim`),args:__codexLinuxOpenTargetNvimArgs,open:__codexLinuxOpenTargetRunNvim}})"
].join(",");

export async function patchUpstreamApp(stageAppDir) {
  const buildDir = path.join(stageAppDir, ".vite", "build");
  const entries = await fs.readdir(buildDir);
  const mainBundleName = entries.find((entry) => /^main-.*\.js$/.test(entry));

  if (!mainBundleName) {
    throw new Error(`Unable to locate upstream main bundle under ${buildDir}`);
  }

  const mainBundlePath = path.join(buildDir, mainBundleName);
  const source = await fs.readFile(mainBundlePath, "utf8");
  const patched = patchLinuxOpenTargetsSource(source);

  if (patched === source) {
    return;
  }

  await fs.writeFile(mainBundlePath, patched);
}

export function patchLinuxOpenTargetsSource(source) {
  let patched = source;

  if (!patched.includes("__codexLinuxVSCode=")) {
    patched = replaceOnce(
      patched,
      openTargetAnchor,
      `${linuxOpenTargetDefinitions};${openTargetAnchor.replace("var Cd=[", "var Cd=[__codexLinuxVSCode,__codexLinuxVSCodeInsiders,__codexLinuxCursor,__codexLinuxZed,__codexLinuxNvim,")}`
    );
  }

  const patchedOpenTargetMap = "targets:[...o.map(({id:e,label:t,icon:n,kind:r,hidden:i})=>({id:e,target:e,label:t,icon:n,kind:r,hidden:i,appPath:process.platform===`linux`&&r===`editor`&&s.has(e)?Ld().get(e)??null:null,available:s.has(e),default:c===e||void 0})),...p]";

  if (!patched.includes(patchedOpenTargetMap)) {
    patched = replaceOnce(patched, openTargetMapAnchor, patchedOpenTargetMap);
  }

  return patched;
}

function replaceOnce(source, search, replacement) {
  const index = source.indexOf(search);

  if (index === -1) {
    throw new Error(`Unable to apply upstream patch; missing anchor: ${search.slice(0, 80)}`);
  }

  if (source.indexOf(search, index + search.length) !== -1) {
    throw new Error(`Unable to apply upstream patch; ambiguous anchor: ${search.slice(0, 80)}`);
  }

  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}
