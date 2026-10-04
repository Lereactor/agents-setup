/** Расшифровка конфигурации публичного сайта (адрес лога + ключ только для чтения).
 *  Шифрует scripts/build-site.mjs теми же параметрами: PBKDF2-SHA256 → AES-GCM-256.
 *  Без пароля в опубликованных файлах нет ни адреса лога, ни ключа. */

export interface SiteConfig {
  url: string
  token: string
}

export interface EncryptedConfig {
  v: 1
  iter: number
  salt: string
  iv: string
  ct: string
}

function b64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function decryptConfig(enc: EncryptedConfig, password: string): Promise<SiteConfig> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct))
  return JSON.parse(new TextDecoder().decode(plain)) as SiteConfig
}
