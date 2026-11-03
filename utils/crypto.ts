// FGC NEXUS — LOPD-GDD Cryptographic Security Layer (AES-256-CBC)
// Standard AES-256-CBC encryption/decryption matching PostgreSQL pgcrypto

const CIPHER_KEY_STR = 'FGC_NEXUS_SECURE_CIPHER_KEY_2026'; // 32 bytes (256-bit)
const CIPHER_IV_STR = 'FGC_CIPHER_IV_26';                // 16 bytes (128-bit)

let cachedCryptoKey: CryptoKey | null = null;
const plaintextCache = new Map<string, string>();

async function getCryptoKey(): Promise<CryptoKey> {
  if (cachedCryptoKey) return cachedCryptoKey;
  const subtle = (typeof window !== 'undefined' ? window.crypto?.subtle : globalThis.crypto?.subtle);
  if (!subtle) {
    throw new Error('Web Crypto API is not available in this environment');
  }

  const enc = new TextEncoder();
  const keyBytes = enc.encode(CIPHER_KEY_STR);
  cachedCryptoKey = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedCryptoKey;
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Decrypts an encrypted string starting with 'ENC:'.
 * If the string is not encrypted (plain text), returns it as-is.
 */
export async function decryptText(encryptedStr: string | null | undefined): Promise<string> {
  if (!encryptedStr) return '';
  if (!encryptedStr.startsWith('ENC:')) {
    return encryptedStr; // Legacy plain text
  }

  if (plaintextCache.has(encryptedStr)) {
    return plaintextCache.get(encryptedStr)!;
  }

  try {
    const hex = encryptedStr.substring(4);
    const ciphertext = hexToUint8Array(hex);
    const key = await getCryptoKey();
    const enc = new TextEncoder();
    const iv = enc.encode(CIPHER_IV_STR);

    const subtle = (typeof window !== 'undefined' ? window.crypto?.subtle : globalThis.crypto?.subtle);
    const decryptedBuf = await subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      ciphertext as unknown as BufferSource
    );

    const dec = new TextDecoder();
    const plaintext = dec.decode(decryptedBuf);
    plaintextCache.set(encryptedStr, plaintext);
    return plaintext;
  } catch (err) {
    console.warn('[Crypto] Decryption failed for token, returning fallback:', err);
    return encryptedStr;
  }
}

/**
 * Encrypts a plain text string into 'ENC:<hex>' format.
 */
export async function encryptText(plainText: string | null | undefined): Promise<string> {
  if (!plainText) return '';
  if (plainText.startsWith('ENC:')) return plainText;

  try {
    const key = await getCryptoKey();
    const enc = new TextEncoder();
    const iv = enc.encode(CIPHER_IV_STR);
    const subtle = (typeof window !== 'undefined' ? window.crypto?.subtle : globalThis.crypto?.subtle);

    const encryptedBuf = await subtle.encrypt(
      { name: 'AES-CBC', iv },
      key,
      enc.encode(plainText)
    );

    const hex = uint8ArrayToHex(new Uint8Array(encryptedBuf));
    const token = `ENC:${hex}`;
    plaintextCache.set(token, plainText);
    return token;
  } catch (err) {
    console.error('[Crypto] Encryption error:', err);
    return plainText;
  }
}

/**
 * Decrypts an array of phone numbers.
 */
export async function decryptPhoneArray(phones: string[] | null | undefined): Promise<string[]> {
  if (!phones || !Array.isArray(phones)) return [];
  return Promise.all(phones.map(p => decryptText(p)));
}

/**
 * Decrypts phonebook list of rows: [{ nomina, nom?, cognom1?, cognom2?, phones, ... }]
 */
export async function decryptPhonebookRows<T extends { nom?: string | null; cognom1?: string | null; cognom2?: string | null; phones?: string[] | null }>(rows: T[] | null | undefined): Promise<T[]> {
  if (!rows || !Array.isArray(rows)) return [];
  return Promise.all(
    rows.map(async (row) => {
      const decNom = row.nom ? await decryptText(row.nom) : row.nom;
      const decCognom1 = row.cognom1 ? await decryptText(row.cognom1) : row.cognom1;
      const decCognom2 = row.cognom2 ? await decryptText(row.cognom2) : row.cognom2;
      const decPhones = row.phones && Array.isArray(row.phones) ? await decryptPhoneArray(row.phones) : row.phones;
      return {
        ...row,
        nom: decNom,
        cognom1: decCognom1,
        cognom2: decCognom2,
        phones: decPhones
      };
    })
  );
}

/**
 * Decrypts agent rows: [{ name?, surname?, phone?, dni?, email?, ... }]
 */
export async function decryptAgentRows<T extends { name?: string | null; surname?: string | null; phone?: string | null; dni?: string | null; email?: string | null }>(rows: T[] | null | undefined): Promise<T[]> {
  if (!rows || !Array.isArray(rows)) return [];
  return Promise.all(
    rows.map(async (agent) => {
      const decName = agent.name ? await decryptText(agent.name) : agent.name;
      const decSurname = agent.surname ? await decryptText(agent.surname) : agent.surname;
      const decPhone = agent.phone ? await decryptText(agent.phone) : agent.phone;
      const decDni = agent.dni ? await decryptText(agent.dni) : agent.dni;
      const decEmail = agent.email ? await decryptText(agent.email) : agent.email;
      return {
        ...agent,
        name: decName,
        surname: decSurname,
        phone: decPhone,
        dni: decDni,
        email: decEmail
      };
    })
  );
}

/**
 * Encrypts an array of phone numbers.
 */
export async function encryptPhoneArray(phones: string[] | null | undefined): Promise<string[]> {
  if (!phones || !Array.isArray(phones)) return [];
  return Promise.all(phones.map(p => encryptText(p)));
}
