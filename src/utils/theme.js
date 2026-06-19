// ─── TEMA WARNA GAMING ───────────────────────────────────────────────────────
export const C = {
  BG:       '#0D0D1A',
  PANEL:    '#12122A',
  CARD:     '#1A1A3A',
  ACCENT:   '#00FFCC',
  ACCENT2:  '#7B2FFF',
  RED:      '#FF3366',
  GREEN:    '#39FF14',
  YELLOW:   '#FFD700',
  TEXT:     '#E0E0FF',
  MUTED:    '#6060A0',
  BTN:      '#1E1E4A',
  BORDER:   '#2A2A5A',
  ORANGE:   '#FF8C00',
};

export const FONTS = {
  title:  { fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold' },
  sub:    { fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold' },
  body:   { fontFamily: 'monospace', fontSize: 12 },
  small:  { fontFamily: 'monospace', fontSize: 10 },
  label:  { fontFamily: 'monospace', fontSize: 11 },
  timer:  { fontFamily: 'monospace', fontSize: 28, fontWeight: 'bold', letterSpacing: 2 },
};

export function fmtRp(n) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

export const DEFAULT_PAKET = {
  '30 Menit':   5000,
  '1 Jam':     10000,
  '2 Jam':     18000,
  '3 Jam':     25000,
  '5 Jam':     35000,
  'Overnight': 50000,
  'Main Bebas':    0,
  'Reguler':   12000,
};

export const DEFAULT_MAKANAN = {
  'Indomie Goreng':  8000,
  'Indomie Kuah':    8000,
  'Kentang Goreng': 12000,
  'Burger':         20000,
  'Roti Bakar':     10000,
  'Nasi Goreng':    15000,
  'Sosis Bakar':     7000,
};

export const DEFAULT_MINUMAN = {
  'Air Mineral':     3000,
  'Es Teh Manis':    5000,
  'Es Jeruk':        6000,
  'Kopi Hitam':      6000,
  'Susu Coklat':     8000,
  'Jus Mangga':     10000,
  'Soda Gembira':   10000,
  'Pocari Sweat':    8000,
};

export const MENIT_MAP = {
  '30 Menit':   30,
  '1 Jam':      60,
  '2 Jam':     120,
  '3 Jam':     180,
  '5 Jam':     300,
  'Overnight': 540,
  'Main Bebas':  0,
  'Reguler':    60,
};
