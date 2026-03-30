import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const projectRoot = process.cwd();

function parseEnv(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) continue;

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();

    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadProjectEnv() {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) return {};
  return parseEnv(readFileSync(envPath, 'utf-8'));
}

function loadPackageVersion() {
  const packagePath = resolve(projectRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  return packageJson.version;
}

function injectMetadata(rawBanner, env, packageVersion) {
  const footer = '// ==/UserScript==';
  const footerIndex = rawBanner.lastIndexOf(footer);
  if (footerIndex === -1) return rawBanner;

  const beforeFooter = rawBanner.slice(0, footerIndex);
  const afterFooter = rawBanner.slice(footerIndex);

  const versionLine = `// @version      ${packageVersion}`;
  const withVersion = beforeFooter.match(/^\/\/ @version\s+.+$/m)
    ? beforeFooter.replace(/^\/\/ @version\s+.+$/m, versionLine)
    : `${beforeFooter.replace(/\s*$/, '\n')}${versionLine}\n`;

  const updateUrl = env.TM_UPDATE_URL || '';
  const downloadUrl = env.TM_DOWNLOAD_URL || '';

  const metadataLines = [];
  if (updateUrl) metadataLines.push(`// @updateURL    ${updateUrl}`);
  if (downloadUrl) metadataLines.push(`// @downloadURL  ${downloadUrl}`);

  if (metadataLines.length === 0) {
    return `${withVersion.replace(/\s*$/, '\n')}${afterFooter}`;
  }

  return `${withVersion.replace(/\s*$/, '\n')}${metadataLines.join('\n')}\n${afterFooter}`;
}

const env = loadProjectEnv();
const packageVersion = loadPackageVersion();
const rawBanner = readFileSync('./banner.txt', 'utf-8');
const banner = injectMetadata(rawBanner, env, packageVersion);

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/boss-zhipin.user.js',
    format: 'iife',
    banner,
    sourcemap: false,
  },
};
