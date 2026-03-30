import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const projectRoot = resolve(process.cwd());
const distDir = resolve(projectRoot, 'dist');
const distScriptPath = resolve(distDir, 'boss-zhipin.user.js');
const fileRequireUrl = pathToFileURL(distScriptPath).href;
const loaderPath = resolve(distDir, 'tampermonkey-dev-loader.user.js');

const loaderScript = `// ==UserScript==\n// @name         BOSS直聘智能招呼助手 (本地开发桥接)\n// @namespace    http://tampermonkey.net/\n// @version      0.0.1\n// @description  开发专用：通过 @require 直连本地 dist 构建产物，避免每次手动复制\n// @author       BossHelper\n// @match        https://*.zhipin.com/web/*/recommend/*\n// @match        https://*.zhipin.com/web/chat/recommend\n// @match        https://*.zhipin.com/web/chat/index\n// @require      ${fileRequireUrl}\n// @run-at       document-end\n// ==/UserScript==\n`;

mkdirSync(distDir, { recursive: true });
writeFileSync(loaderPath, loaderScript, 'utf8');

console.log('✅ 已生成 Tampermonkey 开发桥接脚本:');
console.log(`   ${loaderPath}`);
console.log('');
console.log('下一步（只做一次）：');
console.log('1) 打开 Tampermonkey > 实用工具 > 导入文件');
console.log('2) 选择上面的 tampermonkey-dev-loader.user.js');
console.log('3) 确保浏览器扩展中已开启 Tampermonkey 的“允许访问文件网址”');
console.log('');
console.log('现在将启动 Rollup watch。后续改代码仅需刷新页面，无需再手动复制。');

const rollupBin = resolve(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'rollup.cmd' : 'rollup');
const watchProcess = spawn(rollupBin, ['-c', '--watch'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

watchProcess.on('exit', (code) => {
  process.exit(code ?? 0);
});
