/**
 * Body masking for the inspector, cURL export and replay preview: values of JSON / form fields
 * with secret-like keys (password, token, secret, api_key, authorization, card number, cvv...) and
 * anything that looks like a payment card number (13-19 digits passing the Luhn check) are shown
 * as MASK until the user explicitly reveals them for that view. Pure; runs in the browser.
 */
import { MASK } from "./sensitive";

const SECRET_SUFFIXES = [
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "apikey",
  "privatekey",
  "accesskey",
  "secretkey",
  "authorization",
  "credential",
  "credentials",
  "cardnumber",
  "ccnumber",
  "cardno",
  "cvv",
  "cvc",
  "cvv2",
  "securitycode",
  "ssn",
  "sessionid",
  "cookie",
];
const SECRET_EXACT = new Set(["auth", "pwd", "pan", "pin", "otp", "sig", "signature"]);

/** True for keys such as password, client_secret, accessToken, X-Api-Key, card_number, cvv. */
export function isSecretKey(key: string): boolean {
  const n = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!n) return false;
  return SECRET_EXACT.has(n) || SECRET_SUFFIXES.some((s) => n.endsWith(s));
}

/** Luhn check on 13-19 digits (payment card numbers). */
export function looksLikeCardNumber(value: string): boolean {
  const digits = value.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Deep copy of a parsed JSON value with secret fields and card numbers masked. */
export function maskJson(value: unknown): { value: unknown; count: number } {
  let count = 0;
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 64) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (isSecretKey(k) && x !== null && x !== "") {
          count++;
          out[k] = MASK;
        } else {
          out[k] = walk(x, depth + 1);
        }
      }
      return out;
    }
    if ((typeof v === "string" || typeof v === "number") && looksLikeCardNumber(String(v))) {
      count++;
      return MASK;
    }
    return v;
  };
  return { value: walk(value, 0), count };
}

const JSON_PAIR = /("(?:[^"\\\n]|\\.)*")(\s*:\s*)("(?:[^"\\\n]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false)/g;
const CARD_RUN = /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g;

function unquote(s: string): string {
  try {
    return JSON.parse(s) as string;
  } catch {
    return s.slice(1, -1);
  }
}

/**
 * Masks a raw text body while keeping its formatting: JSON `"key": value` pairs with secret keys,
 * form fields (application/x-www-form-urlencoded) with secret keys, and card-number digit runs.
 */
export function maskBodyText(text: string, contentType: string | null): { text: string; count: number } {
  let count = 0;
  let out = text;
  const isForm = /application\/x-www-form-urlencoded/i.test(contentType ?? "");
  if (isForm) {
    out = out
      .split("&")
      .map((pair) => {
        const eq = pair.indexOf("=");
        if (eq === -1) return pair;
        let key = pair.slice(0, eq);
        try {
          key = decodeURIComponent(key.replace(/\+/g, " "));
        } catch {
          /* keep raw */
        }
        if (isSecretKey(key) && pair.length > eq + 1) {
          count++;
          return `${pair.slice(0, eq)}=${encodeURIComponent(MASK)}`;
        }
        return pair;
      })
      .join("&");
  } else {
    out = out.replace(JSON_PAIR, (m, key: string, sep: string, val: string) => {
      if (!isSecretKey(unquote(key)) || val === '""') return m;
      count++;
      return `${key}${sep}"${MASK}"`;
    });
  }
  out = out.replace(CARD_RUN, (m) => {
    if (!looksLikeCardNumber(m)) return m;
    count++;
    return MASK;
  });
  return { text: out, count };
}
