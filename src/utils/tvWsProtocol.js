/**
 * tvWsProtocol.js — Protokol JSON antara Billing App (server) dan android_tv_client (client).
 * Port dari tv_ws_hub.py + Protocol.kt
 */

function fmtRp(val) {
  try { return `Rp ${Number(val).toLocaleString('id-ID')}`; }
  catch { return `Rp ${val}`; }
}

// ─── Server → Client Builders ────────────────────────────────

export function buildStartTimer(mejaId, sisaDetik, namaRental, totalTagihan, opts = {}) {
  return {
    action: 'START_TIMER',
    meja_id: mejaId,
    sisa_detik: Number(sisaDetik) || 0,
    nama_rental: namaRental || 'RR Billing Pro',
    total_tagihan: fmtRp(totalTagihan),
    lunas_total: fmtRp(opts.lunasTotal || 0),
    tagihan_total: fmtRp(opts.tagihanTotal || 0),
    overlay_mode: opts.overlayMode || 'always',
    overlay_last_minutes: opts.overlayLastMinutes || 5,
    nama_member: opts.namaMember || '',
  };
}

export function buildStopTimer(mejaId) {
  return { action: 'STOP_TIMER', meja_id: mejaId };
}

export function buildSyncTimer(mejaId, sisaDetik, totalTagihan, opts = {}) {
  return {
    action: 'SYNC_TIMER',
    meja_id: mejaId,
    sisa_detik: Number(sisaDetik) || 0,
    total_tagihan: fmtRp(totalTagihan),
    lunas_total: fmtRp(opts.lunasTotal || 0),
    tagihan_total: fmtRp(opts.tagihanTotal || 0),
    overlay_mode: opts.overlayMode || 'always',
    overlay_last_minutes: opts.overlayLastMinutes || 5,
    nama_member: opts.namaMember || '',
  };
}

export function buildPauseTimer(mejaId) {
  return { action: 'PAUSE_TIMER', meja_id: mejaId };
}

export function buildResumeTimer(mejaId, sisaDetik) {
  return { action: 'RESUME_TIMER', meja_id: mejaId, sisa_detik: Number(sisaDetik) || 0 };
}

export function buildUpdateTotal(mejaId, totalTagihan, opts = {}) {
  return {
    action: 'UPDATE_TOTAL',
    meja_id: mejaId,
    total_tagihan: fmtRp(totalTagihan),
    lunas_total: fmtRp(opts.lunasTotal || 0),
    tagihan_total: fmtRp(opts.tagihanTotal || 0),
  };
}

export function buildLockScreen(mejaId, pesan, detail = {}) {
  return {
    action: 'LOCK_SCREEN',
    meja_id: mejaId,
    pesan: pesan || 'WAKTU SEWA HABIS',
    detail_transaksi: {
      meja: detail.meja || mejaId,
      sewa: detail.sewa || '-',
      fnb: detail.fnb || 'Rp 0',
      total: detail.total || 'Rp 0',
      sewa_harga: detail.sewaHarga || '',
      sewa_lunas: detail.sewaLunas !== false,
      lunas_total: detail.lunasTotal || '',
      tagihan_total: detail.tagihanTotal || '',
      makanan: detail.makanan || [],
      minuman: detail.minuman || [],
      logo_url: detail.logoUrl || '',
      promo_url: detail.promoUrl || '',
    },
  };
}

export function buildUnlockScreen(mejaId) {
  return { action: 'UNLOCK_SCREEN', meja_id: mejaId };
}

export function buildShowMedia(mejaId, mediaType, url) {
  return { action: 'SHOW_MEDIA', meja_id: mejaId, type: mediaType || 'video', url };
}

export function buildHideMedia(mejaId) {
  return { action: 'HIDE_MEDIA', meja_id: mejaId };
}

export function buildShowPin(mejaId, pin) {
  return { action: 'SHOW_PIN', meja_id: mejaId, pin };
}

export function buildHidePin(mejaId) {
  return { action: 'HIDE_PIN', meja_id: mejaId };
}

export function buildSleepTv(mejaId, countdown) {
  return { action: 'SLEEP_TV', meja_id: mejaId, countdown: Number(countdown) || 10 };
}

export function buildUpdateLogo(mejaId, logoUrl) {
  return { action: 'UPDATE_LOGO', meja_id: mejaId, logo_url: logoUrl };
}

export function buildUpdateRental(mejaId, namaRental) {
  return { action: 'UPDATE_RENTAL', meja_id: mejaId, nama_rental: namaRental };
}

export function buildToast(mejaId, message, duration) {
  return { action: 'SHOW_TOAST', meja_id: mejaId, message: message || '', duration: Number(duration) || 3 };
}

export function buildOverlaySettings(mejaId, mode, lastMinutes) {
  return {
    action: 'OVERLAY_SETTINGS',
    meja_id: mejaId,
    overlay_mode: mode || 'always',
    overlay_last_minutes: Number(lastMinutes) || 5,
  };
}

export function buildPing() {
  return { action: 'PING', timestamp: Math.floor(Date.now() / 1000) };
}

// ─── Client → Server Parser ──────────────────────────────────

export function parseClientMessage(raw) {
  try {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const type = msg.type;
    if (!type) return null;

    switch (type) {
      case 'REGISTER':
        return {
          type: 'REGISTER',
          mejaId: (msg.meja_id || '').trim(),
          nama: (msg.nama || msg.meja_id || '').trim(),
          device: msg.device || 'android_tv',
        };
      case 'PONG':
        return { type: 'PONG' };
      case 'SCREEN_STATE':
        return {
          type: 'SCREEN_STATE',
          screenOn: msg.screen_on === true,
        };
      case 'GET_TVS':
        return { type: 'GET_TVS' };
      default:
        return { type: 'UNKNOWN', raw: msg };
    }
  } catch {
    return null;
  }
}

// ─── Registered response builder ─────────────────────────────

export function buildRegistered(mejaId, state = null) {
  const msg = { type: 'REGISTERED', status: 'OK', meja_id: mejaId };
  if (state) msg.state = state;
  return msg;
}

export function buildError(message) {
  return { type: 'ERROR', message };
}
