import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const envPath = resolve(projectRoot, '.env');
const isDryRun = process.argv.includes('--dry-run');

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

function loadEnv() {
  const envFromFile = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf-8')) : {};
  return { ...envFromFile, ...process.env };
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function requireConfig(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`缺少配置: ${key}，请在 .env 中补充`);
  }
  return value;
}

function loadScriptContent(scriptPath) {
  const fullPath = resolve(projectRoot, scriptPath);
  if (!existsSync(fullPath)) {
    throw new Error(`未找到脚本文件: ${fullPath}。请先执行 npm run build`);
  }
  return readFileSync(fullPath, 'utf-8');
}

async function saveMockCase(baseUrl, token, mockData) {
  const url = `${baseUrl.replace(/\/$/, '')}/plugin/advmock/case/save?token=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mockData),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}: ${JSON.stringify(json)}`);
  }

  if (json.errcode && json.errcode !== 0) {
    throw new Error(`YApi 返回失败: ${JSON.stringify(json)}`);
  }

  return json;
}

async function main() {
  const env = loadEnv();

  const baseUrl = requireConfig(env, 'YAPI_BASE_URL');
  const token = requireConfig(env, 'YAPI_TOKEN');
  const interfaceId = Number(requireConfig(env, 'YAPI_INTERFACE_ID'));
  const projectId = Number(requireConfig(env, 'YAPI_PROJECT_ID'));
  const mockCaseId = Number(requireConfig(env, 'YAPI_MOCK_CASE_ID'));

  const caseName = env.YAPI_CASE_NAME || 'BOSS直聘打招呼脚本';
  const uid = env.YAPI_UID || '37';
  const scriptPath = env.SYNC_SCRIPT_PATH || 'dist/boss-zhipin.user.js';
  const caseEnable = normalizeBool(env.YAPI_CASE_ENABLE, true);

  const scriptContent = loadScriptContent(scriptPath);

  const mockData = {
    id: mockCaseId,
    name: caseName,
    ip_enable: false,
    params: {},
    code: 200,
    delay: 0,
    headers: [
      {
        name: 'Content-Type',
        value: 'application/javascript; charset=utf-8',
      },
      {
        name: 'Cache-Control',
        value: 'no-store, no-cache, must-revalidate, max-age=0',
      },
      {
        name: 'Pragma',
        value: 'no-cache',
      },
      {
        name: 'Expires',
        value: '0',
      },
    ],
    res_body: scriptContent,
    interface_id: interfaceId,
    project_id: projectId,
    case_enable: caseEnable,
    uid,
  };

  if (isDryRun) {
    console.log('🧪 dry-run 模式，不会发请求。');
    console.log(JSON.stringify({ baseUrl, mockData: { ...mockData, res_body: `...(length: ${scriptContent.length})` } }, null, 2));
    return;
  }

  const result = await saveMockCase(baseUrl, token, mockData);
  console.log('✅ 同步成功:', JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('❌ 同步失败:', error.message);
  process.exit(1);
});
