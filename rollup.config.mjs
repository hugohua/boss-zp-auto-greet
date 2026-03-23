import { readFileSync, cpSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const isExtension = process.env.BUILD_MODE !== 'userscript';

// 复制 public 资产到 dist 的插件
function copyPublicPlugin() {
    return {
        name: 'copy-public',
        writeBundle() {
            // 复制 public 目录下的所有静态文件到 dist
            const publicDir = resolve('public');
            const distDir = resolve('dist');

            if (existsSync(publicDir)) {
                cpSync(publicDir, distDir, { recursive: true });
                console.log('✓ public/ → dist/ 复制完成');
            }

            // 复制 content.css
            const cssSource = resolve('src/content.css');
            const cssDest = resolve('dist/content.css');
            if (existsSync(cssSource)) {
                cpSync(cssSource, cssDest);
                console.log('✓ content.css 复制完成');
            }
        }
    };
}

const extensionConfig = [
    // 1. Content script (ISOLATED world)
    {
        input: 'src/extension-content.js',
        output: {
            file: 'dist/content.js',
            format: 'iife',
            sourcemap: false,
        },
        plugins: [],
    },
    // 2. Injected script (MAIN world — APM 清洗)
    {
        input: 'src/injected.js',
        output: {
            file: 'dist/injected.js',
            format: 'iife',
            sourcemap: false,
        },
        plugins: [],
    },
    // 3. Background service worker
    {
        input: 'src/background.js',
        output: {
            file: 'dist/background.js',
            format: 'es',
            sourcemap: false,
        },
        plugins: [copyPublicPlugin()],
    },
];

// 保留旧的 UserScript 构建（向后兼容）
const userscriptConfig = {
    input: 'src/index.js',
    output: {
        file: 'dist/boss-zhipin.user.js',
        format: 'iife',
        banner: !isExtension && existsSync('./banner.txt') ? readFileSync('./banner.txt', 'utf-8') : '',
        sourcemap: false,
    },
};

export default isExtension ? extensionConfig : userscriptConfig;
