// Kullanıcıya gösterilecek Türkçe hata mesajları ve teknik ayrıntıların ayrılması.
// Hiçbir hata mesajı token, parola veya Authorization başlığı içermemelidir: redact() bunu garanti eder.

export const ErrorCode = Object.freeze({
  NETWORK: 'network',
  HUB_UNREACHABLE: 'hub_unreachable',
  AUTH_INVALID: 'auth_invalid',
  AUTH_EXPIRED: 'auth_expired',
  MFA_INVALID: 'mfa_invalid',
  FORBIDDEN: 'forbidden',
  TIMEOUT: 'timeout',
  NOT_FOUND: 'not_found',
  INVALID_INPUT: 'invalid_input',
  DEVICE_UNAVAILABLE: 'device_unavailable',
  SERVICE_FAILED: 'service_failed',
  NOT_SUPPORTED: 'not_supported',
  INSECURE_CONTEXT: 'insecure_context',
  BLOCKED_ACTION: 'blocked_action',
  UNKNOWN: 'unknown',
});

const MESSAGES = {
  network: 'İnternet veya yerel ağ bağlantısı yok. Telefonunuzun Wi-Fi ya da mobil veri bağlantısını kontrol edin.',
  hub_unreachable: 'Merkezle bağlantı kurulamadı. Ağ bağlantısını ve Home Assistant hizmetini kontrol edin.',
  auth_invalid: 'Oturum geçersiz. Lütfen yeniden giriş yapın.',
  auth_expired: 'Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.',
  mfa_invalid: 'Doğrulama kodu hatalı. Kimlik doğrulayıcı uygulamanızdaki güncel kodu girin.',
  forbidden: 'Bu işlem için yetkiniz yok. Home Assistant yöneticisinden yetki isteyin.',
  timeout: 'Merkez zamanında yanıt vermedi. Biraz sonra yeniden deneyin.',
  not_found: 'İstenen öğe bulunamadı. Silinmiş veya adı değişmiş olabilir.',
  invalid_input: 'Girilen bilgiler geçersiz. Alanları kontrol edip yeniden deneyin.',
  device_unavailable: 'Cihaz şu anda çevrim dışı. Cihazın elektriğini ve ağ bağlantısını kontrol edin.',
  service_failed: 'Komut cihaz tarafından yerine getirilemedi.',
  not_supported: 'Bu cihaz bu işlemi desteklemiyor.',
  insecure_context: 'Bağlantı güvenli değil (HTTPS yok). Oturum bu cihazda kalıcı olarak saklanamaz.',
  blocked_action: 'Güvenlik nedeniyle bu işlem otomasyon veya senaryo içinde kullanılamaz.',
  unknown: 'Beklenmeyen bir hata oluştu.',
};

const SECRET_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
  /("?(?:access_token|refresh_token|password|code|token|api_password)"?\s*[:=]\s*"?)[^"&,\s}]+/gi,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];

/** Metinden olası gizli bilgileri temizler. */
export function redact(text) {
  if (text == null) return '';
  let out = String(text);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, prefix) => (typeof prefix === 'string' ? `${prefix}***` : '***'));
  }
  return out;
}

export class AppError extends Error {
  /**
   * @param {string} code ErrorCode değeri
   * @param {object} [opts]
   * @param {string} [opts.message] Kullanıcı mesajını özelleştirmek için
   * @param {string} [opts.details] Teknik ayrıntı (temizlenerek saklanır)
   * @param {unknown} [opts.cause]
   */
  constructor(code, opts = {}) {
    const userMessage = opts.message || MESSAGES[code] || MESSAGES.unknown;
    super(userMessage);
    this.name = 'AppError';
    this.code = MESSAGES[code] ? code : ErrorCode.UNKNOWN;
    this.userMessage = userMessage;
    this.details = redact(opts.details || (opts.cause && opts.cause.message) || '');
  }
}

export function userMessageFor(code) {
  return MESSAGES[code] || MESSAGES.unknown;
}

/** Home Assistant WebSocket hata nesnesini AppError'a çevirir. */
export function fromHaError(err, context = '') {
  if (err instanceof AppError) return err;
  const code = err && err.code;
  const msg = (err && err.message) || '';
  const details = `${context ? context + ': ' : ''}${code || 'error'} ${msg}`.trim();
  switch (code) {
    case 'unauthorized':
      return new AppError(ErrorCode.FORBIDDEN, { details });
    case 'not_found':
      return new AppError(ErrorCode.NOT_FOUND, { details });
    case 'invalid_format':
      return new AppError(ErrorCode.INVALID_INPUT, { details });
    case 'timeout':
      return new AppError(ErrorCode.TIMEOUT, { details });
    case 'connection_lost':
      return new AppError(ErrorCode.HUB_UNREACHABLE, { details });
    case 'service_validation_error':
    case 'home_assistant_error':
      return new AppError(ErrorCode.SERVICE_FAILED, {
        details,
        message: msg ? `Komut yerine getirilemedi: ${redact(msg)}` : undefined,
      });
    default:
      return new AppError(ErrorCode.UNKNOWN, { details });
  }
}

/** HTTP yanıt durum kodunu AppError'a çevirir. */
export function fromHttpStatus(status, body = '') {
  const details = `HTTP ${status} ${redact(String(body).slice(0, 300))}`;
  if (status === 401) return new AppError(ErrorCode.AUTH_INVALID, { details });
  if (status === 403) return new AppError(ErrorCode.FORBIDDEN, { details });
  if (status === 404) return new AppError(ErrorCode.NOT_FOUND, { details });
  if (status === 400) return new AppError(ErrorCode.INVALID_INPUT, { details });
  if (status === 504 || status === 408) return new AppError(ErrorCode.TIMEOUT, { details });
  if (status >= 500) return new AppError(ErrorCode.HUB_UNREACHABLE, { details });
  return new AppError(ErrorCode.UNKNOWN, { details });
}
