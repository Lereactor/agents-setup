// Сборка публичного сайта «Мои агенты» для GitHub Pages.
//
//   SITE_PASSWORD=... node scripts/build-site.mjs            — собрать в dist-site/
//   SITE_PASSWORD=... node scripts/build-site.mjs --deploy   — собрать и выложить
//   node scripts/build-site.mjs --deploy                     — без пароля: только новый код сайта,
//                                                              config.enc.json берётся уже опубликованный
//
// Адрес лога и ключ ТОЛЬКО ДЛЯ ЧТЕНИЯ берутся из sheets_api.txt в корне репозитория
// (SHEETS_SITE_URL, SHEETS_SITE_READ_TOKEN — не в git) и шифруются паролем:
// PBKDF2-SHA256 (600 000 итераций) → AES-GCM-256. В опубликованных файлах есть только
// шифротекст; пароль нигде не сохраняется.
import { execSync } from 'node:child_process'
import { randomBytes, webcrypto } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'Lereactor/agents-live'
const BASE = '/agents-live/'
const ITERATIONS = 600_000

const here = dirname(fileURLToPath(import.meta.url))
const frontend = resolve(here, '..')
const outDir = join(frontend, 'dist-site')
const secretsFile = resolve(frontend, '..', '..', 'sheets_api.txt')

function readSecrets() {
  const vars = {}
  for (const line of readFileSync(secretsFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) vars[m[1]] = m[2].trim()
  }
  for (const key of ['SHEETS_SITE_URL', 'SHEETS_SITE_READ_TOKEN']) {
    if (!vars[key]) throw new Error(`В ${secretsFile} нет ${key}`)
  }
  return { url: vars.SHEETS_SITE_URL, token: vars.SHEETS_SITE_READ_TOKEN }
}

// Локальная проверка до появления развёртывания для сайта (никуда не публикуется):
// SITE_TEST_URL / SITE_TEST_TOKEN подменяют значения из sheets_api.txt.
function siteConfig() {
  if (process.env.SITE_TEST_URL && process.env.SITE_TEST_TOKEN) {
    if (process.argv.includes('--deploy')) throw new Error('--deploy с тестовым конфигом запрещён')
    return { url: process.env.SITE_TEST_URL, token: process.env.SITE_TEST_TOKEN }
  }
  return readSecrets()
}

async function encrypt(config, password) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(config)))
  const b64 = (buf) => Buffer.from(buf).toString('base64')
  return { v: 1, iter: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) }
}

// Без пароля шифротекст не пересобираем, а берём опубликованный: пароль и ключ
// остаются прежними, обновляется только код сайта.
const password = process.env.SITE_PASSWORD
let encryptedConfig
if (password) {
  encryptedConfig = await encrypt(siteConfig(), password)
} else {
  const published = `https://${REPO.split('/')[0].toLowerCase()}.github.io${BASE}config.enc.json`
  const resp = await fetch(published, { cache: 'no-store' })
  if (!resp.ok) throw new Error(`Нет SITE_PASSWORD, и не удалось взять опубликованный ${published}: ${resp.status}`)
  encryptedConfig = await resp.json()
  console.log(`SITE_PASSWORD не задан — оставляю опубликованный config.enc.json`)
}

rmSync(outDir, { recursive: true, force: true })
execSync(`npx vite build --base ${BASE} --outDir dist-site --emptyOutDir`, {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, VITE_STATIC: '1' },
})
writeFileSync(join(outDir, 'config.enc.json'), JSON.stringify(encryptedConfig))
writeFileSync(join(outDir, '.nojekyll'), '') // GitHub Pages: отдавать файлы как есть
console.log(`\nСобрано: ${outDir}`)

if (process.argv.includes('--deploy')) {
  const run = (cmd) => execSync(cmd, { cwd: outDir, stdio: 'inherit' })
  if (existsSync(join(outDir, '.git'))) rmSync(join(outDir, '.git'), { recursive: true, force: true })
  run('git init -q -b main')
  run('git add -A')
  run('git -c user.name="agents-live" -c user.email="agents-live@users.noreply.github.com" commit -q -m "Publish site"')
  run(`git push -f https://github.com/${REPO}.git main`)
  console.log(`\nВыложено: https://${REPO.split('/')[0].toLowerCase()}.github.io${BASE}`)
}
