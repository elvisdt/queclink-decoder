'use strict';
// =====================================================================
//  Queclink @Track — motor común de decodificación
//  Las definiciones específicas de cada equipo viven en models/*.js y se
//  registran con registerModel(). Este archivo no depende de ningún modelo.
// =====================================================================

// ---- Registro de modelos ----
const MODELS = [];
const DEVICE_TYPES = {};
function registerModel(m) {
  MODELS.push(m);
  Object.assign(DEVICE_TYPES, m.deviceTypes);
}
function modelById(id) { return MODELS.find(m => m.id === id); }
// Detecta el modelo por el prefijo de <Full Protocol Version> (p. ej. 74xxxx o 802003xxxx).
function detectModel(ver) {
  const v = (ver || '').toUpperCase();
  for (const m of MODELS) for (const code of Object.keys(m.deviceTypes)) {
    if (v.startsWith(code) && v.length === code.length + 4) return m;
  }
  return null;
}
let ACTIVE = null; // modelo con el que se decodifica la trama actual

const MOTION = {
  '11': 'Ignición OFF · en reposo',
  '12': 'Ignición OFF · en movimiento (antes de considerarse remolque)',
  '16': 'Remolque (Tow): ignición OFF y está siendo remolcado',
  '1A': 'Posible remolque (Fake Tow)',
  '21': 'Ignición ON · en reposo',
  '22': 'Ignición ON · en movimiento',
  '41': 'Sensor · en reposo (sin señal de ignición)',
  '42': 'Sensor · en movimiento (sin señal de ignición)',
};

const FRI_ID = { 0: 'Reporte en tiempo real', 1: 'Reporte por tiempo fijo', 2: 'Reporte por distancia fija', 3: 'Reporte por kilometraje fijo', 4: 'Tiempo y kilometraje', 5: 'Tiempo o kilometraje' };
const FRI_TYPE = {
  '0': 'Reporte fijo normal', '1': 'Reporte de esquina (corner)', '2': 'Reporte fijo FFC', '3': 'Esquina FFC',
  '4': 'Reporte de kilometraje (modo 5)', '5': 'Reservado', '6': 'Kilometraje con FFC', '7': 'Bajo demanda (RTO-44)',
  '8': 'Delta de velocidad', 'A': 'Delta de velocidad FFC',
};
const DOG_TYPE = {
  1: 'Reinicio por modo de tiempo', 2: 'Reinicio por ignición encendida', 3: 'Reinicio disparado por entrada',
  4: 'Watchdog de red', 5: 'Watchdog EGPRS/GSM y LTE', 6: 'Watchdog por fallas de envío',
  7: 'Reinicio RF por watchdog de red', 8: 'Reinicio RF por watchdog EGPRS/LTE', 9: 'Reinicio RF por fallas de envío',
};
const HBM_SPEED = { 0: 'desconocida', 1: 'baja', 2: 'media', 3: 'alta' };
const HBM_TYPE = { 0: 'Frenado brusco', 1: 'Aceleración brusca', 2: 'Giro brusco', 3: 'Frenado + giro brusco', 4: 'Aceleración + giro brusco', 5: 'Conducción brusca desconocida' };
const VIRT_MODE = { 0: 'Reservado', 2: 'Voltaje de alimentación externa', 4: 'Acelerómetro', 7: 'Detección combinada (AT+GTVMS)' };
const GNSS_TRIGGER = { '0': 'Punto por tiempo', '1': 'Punto de esquina', '2': 'Punto por distancia', '3': 'Punto por kilometraje', '4': 'Punto óptimo (tiempo y kilometraje)' };
const JAM_STATE = { '0': 'Desconocido', '1': 'OK: sin interferencia significativa', '2': 'Advertencia: posible interferencia', '3': 'Crítico: interferencia visible y sin fix' };
const JAM_NET = { '1': 'EGPRS/GSM', '2': 'LTE Cat1', '3': 'EGPRS/GSM y LTE' };
const MCC = {
  '732': 'Colombia', '460': 'China', '310': 'EE. UU.', '311': 'EE. UU.', '334': 'México', '722': 'Argentina', '724': 'Brasil',
  '730': 'Chile', '716': 'Perú', '740': 'Ecuador', '734': 'Venezuela', '736': 'Bolivia', '744': 'Paraguay', '748': 'Uruguay',
  '704': 'Guatemala', '706': 'El Salvador', '708': 'Honduras', '710': 'Nicaragua', '712': 'Costa Rica', '714': 'Panamá',
  '370': 'Rep. Dominicana', '302': 'Canadá', '214': 'España', '234': 'Reino Unido', '262': 'Alemania', '208': 'Francia', '222': 'Italia',
};
const MNC_CO = { '101': 'Claro', '103': 'Tigo', '111': 'Tigo', '123': 'Movistar', '130': 'Avantel', '360': 'WOM' };
const BT_TYPE = {
  0: 'Sin accesorio', 1: 'Sensor Escort', 2: 'Sensor de temperatura Beacon', 6: 'Sensor multifunción Beacon', 7: 'Accesorio Technoton',
  8: 'Accesorio BT de entradas/salidas', 10: 'Accesorio Mechatronics', 11: 'Sensor magnético', 12: 'Sensor TPMS BLE',
  13: 'Sensor relé', 14: 'Sensor Smart Cap', 15: 'Sensor BLE de movimiento/ángulo', 23: 'Sensor Epsilon',
};
const MSG_INFO = {
  FRI: ['loc', 'Fixed Report Information · reporte periódico de posición'],
  ERI: ['loc', 'Expand Fixed Report Information · reporte periódico con datos de periféricos'],
  TOW: ['alarm', 'Tow Alarm · alarma de remolque'],
  DIS: ['event', 'Digital Input Alarm · cambio en entrada digital'],
  IOB: ['event', 'IO Ports Bind Alarm · combinación de IO'],
  SPD: ['alarm', 'Speed Alarm · alarma de velocidad'],
  SOS: ['alarm', 'SOS · botón de pánico por entrada digital'],
  RTL: ['loc', 'Realtime Location · ubicación solicitada por AT+GTRTO'],
  DOG: ['event', 'Watchdog Reboot · reinicio por watchdog'],
  IGL: ['loc', 'Ignition Location · posición en encendido/apagado'],
  VGL: ['loc', 'Virtual Ignition Location · posición en ignición virtual'],
  HBM: ['alarm', 'Harsh Behavior · conducción brusca'],
  EPS: ['event', 'External Power Supply · alarma de alimentación externa'],
  AIS: ['event', 'Analog Input · alarma de entrada analógica'],
  LBC: ['loc', 'Location By Call · ubicación por llamada/SMS'],
  IDA: ['event', 'ID Authentication · autenticación de conductor'],
  GES: ['event', 'Parking-Fence · geocerca de estacionamiento'],
  GIN: ['event', 'Geo-Fence In · entrada a geocerca'],
  GOT: ['event', 'Geo-Fence Out · salida de geocerca'],
  SPE: ['alarm', 'Speed in Geo-Fence · exceso de velocidad dentro de geocerca'],
  ETI: ['loc', 'Electronic Toll Information · peaje electrónico'],
  MPN: ['event', 'Main Power Connected · alimentación principal conectada'],
  MPF: ['alarm', 'Main Power Disconnected · alimentación principal desconectada'],
  BTC: ['event', 'Battery Charging · batería de respaldo empieza a cargar'],
  STC: ['event', 'Battery Stops Charging · batería deja de cargar'],
  BPL: ['alarm', 'Backup Battery Low · batería de respaldo baja'],
  JDR: ['alarm', 'Network Jamming · interferencia de red detectada'],
  JDS: ['alarm', 'Network Jamming Status · estado de interferencia de red'],
  GPJ: ['alarm', 'GNSS Jamming · interferencia GNSS'],
  STT: ['event', 'Device Status · cambio de estado de movimiento'],
  IGN: ['event', 'Ignition On · motor encendido'],
  IGF: ['event', 'Ignition Off · motor apagado'],
  VGN: ['event', 'Virtual Ignition On · encendido virtual'],
  VGF: ['event', 'Virtual Ignition Off · apagado virtual'],
  IDN: ['event', 'Enter Idle · entra en ralentí'],
  IDF: ['event', 'Exit Idle · sale de ralentí'],
  GSS: ['event', 'GNSS Signal Status · pérdida/recuperación de señal GNSS'],
  STR: ['event', 'Start · inicio de viaje'],
  STP: ['event', 'Stop · parada'],
  LSP: ['event', 'Long Stop · parada prolongada'],
  DOS: ['event', 'Wave Shape Output · estado de salida digital'],
  RMD: ['event', 'Roaming · cambio de estado de roaming'],
  CRA: ['alarm', 'Crash Alarm · colisión detectada'],
  TMP: ['alarm', 'Temperature Alarm · alarma de temperatura'],
  BCS: ['event', 'Bluetooth Connection · conexión Bluetooth'],
  BDS: ['event', 'Bluetooth Disconnection · desconexión Bluetooth'],
  PNA: ['event', 'Power On · equipo encendido'],
  PFA: ['alarm', 'Power Off · equipo apagado'],
  PDP: ['event', 'PDP · conexión GPRS establecida'],
  PNR: ['event', 'Power-on Reason · motivo de encendido'],
  PFR: ['event', 'Power-off Reason · motivo de apagado'],
  INF: ['info', 'Device Information · información general del equipo'],
  GPS: ['info', 'GNSS Information · información GNSS (RTO)'],
  CID: ['info', 'ICCID · tarjeta SIM'],
  CSQ: ['info', 'Signal Quality · nivel de señal celular'],
  VER: ['info', 'Version · firmware y hardware'],
  BAT: ['info', 'Battery · alimentación y batería'],
  IOS: ['info', 'IO Status · estado de entradas/salidas'],
  TMZ: ['info', 'Time Zone · zona horaria'],
  AIF: ['info', 'Basic Device Info · APN, ICCID, celda, IP'],
  DAT: ['info', 'Transparent Data · datos transparentes'],
  HBD: ['ack', 'Heartbeat · latido de conexión'],
};

// =====================================================================
//  UTILIDADES
// =====================================================================
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hexv = v => (/^[0-9A-Fa-f]+$/.test(v || '') ? parseInt(v, 16) : NaN);
const isNum = v => /^-?\d+(\.\d+)?$/.test(String(v ?? '').trim());
const bit = (n, b) => Math.floor(n / Math.pow(2, b)) % 2 === 1;

function fmtTime(t) {
  if (!/^\d{14}$/.test(t || '')) return '';
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}`;
}
function fmtDuration(s) {
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return '';
  const d = Math.floor(n / 86400), h = Math.floor(n % 86400 / 3600), m = Math.floor(n % 3600 / 60), sec = n % 60;
  const parts = [];
  if (d) parts.push(d + ' d');
  if (h) parts.push(h + ' h');
  if (m) parts.push(m + ' min');
  if (sec || !parts.length) parts.push(sec + ' s');
  return parts.join(' ') + (n >= 999999 ? ' (tope 999999 s)' : '');
}
function fmtHourMeter(v) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(v || '');
  return m ? `${parseInt(m[1], 10)} h ${m[2]} min ${m[3]} s` : '';
}
const mvToV = v => (isNum(v) ? (parseFloat(v) / 1000).toFixed(2) + ' V' : '');
function analogHuman(v) {
  if (/^F\d+/i.test(v || '')) return `Combustible ${v.slice(1)} %`;
  return mvToV(v);
}
function cardinal(az) {
  const n = parseFloat(az);
  if (!Number.isFinite(n)) return '';
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(n / 45) % 8];
}
function csqText(v, netType) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return '';
  if (n === 99 || n === 255) return 'Desconocido';
  const rssi = n === 0 ? '< -113 dBm' : n === 1 ? '-111 dBm' : n <= 30 ? `${-109 + (n - 2) * 2} dBm` : n === 31 ? '> -51 dBm' : null;
  const rsrp = n === 0 ? '< -140 dBm' : n === 1 ? '-140 dBm' : n <= 96 ? `${-141 + n} dBm` : n === 97 ? '≥ -44 dBm' : null;
  if (netType === '3') return `RSRP LTE ${rsrp}`;
  if (netType === '1') return `RSSI 2G ${rssi}`;
  if (n > 31) return `RSRP LTE ${rsrp}`;
  return `RSSI 2G ${rssi} · si la red es LTE: RSRP ${rsrp}`;
}
function decodeProtocolVersion(ver) {
  const v = (ver || '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(v)) {
    const dev = v.slice(0, 2), major = parseInt(v.slice(2, 4), 16), minor = parseInt(v.slice(4, 6), 16);
    return { ok: true, dev, devName: DEVICE_TYPES[dev] || `Tipo ${dev}`, major, minor, version: `${major}.${String(minor).padStart(2, '0')}` };
  }
  if (/^[0-9A-F]{10}$/.test(v)) {
    const dev = v.slice(0, 6), major = parseInt(v.slice(6, 8), 16), minor = parseInt(v.slice(8, 10), 16);
    return { ok: true, dev, devName: DEVICE_TYPES[dev] || `Tipo ${dev}`, major, minor, version: `${major}.${String(minor).padStart(2, '0')}` };
  }
  return { ok: false, dev: '?', devName: 'Desconocido', major: NaN, minor: NaN, version: '?' };
}
function ioBits(v, kind) {
  const n = hexv(v);
  if (!Number.isFinite(n)) return '';
  const low = n & 0xFF;
  const out = [];
  if (kind === 'in') {
    out.push(`Entrada ignición ${bit(low, 0) ? 'ON' : 'OFF'}`);
    for (let b = 1; b <= 3; b++) out.push(`DI${b} ${bit(low, b) ? '●' : '○'}`);
  } else {
    for (let b = 0; b <= 4; b++) out.push(`DO${b + 1} ${bit(low, b) ? '●' : '○'}`);
  }
  if (v.length > 2 && (n >> 8)) out.push(`EIO100: 0x${(n >> 8).toString(16).toUpperCase()}`);
  return out.join(' · ');
}
function deviceStatusText(v) {
  const s = (v || '').toUpperCase();
  if (!/^[0-9A-F]{6}([0-9A-F]{4})?$/.test(s)) return v ? 'Formato inesperado' : 'Sin dato';
  let eio = '', core = s;
  if (s.length === 10) { eio = ` · EIO100 entradas 0x${s.slice(0, 2)}, salidas 0x${s.slice(2, 4)}`; core = s.slice(4); }
  const motion = core.slice(0, 2);
  return `${MOTION[motion] || 'Movimiento ' + motion} · ${ioBits(core.slice(2, 4), 'in')} · ${ioBits(core.slice(4, 6), 'out')}${eio}`;
}
function ridText(msg, v) {
  if (!/^[0-9A-F]{2}$/i.test(v || '')) return v ? 'Formato inesperado' : 'Vacío';
  const id = parseInt(v[0], 16), tc = v[1].toUpperCase(), t = parseInt(tc, 16);
  switch (msg) {
    case 'FRI': case 'ERI': return `ID ${id}: ${FRI_ID[id] || 'desconocido'} · Tipo ${tc}: ${FRI_TYPE[tc] || 'desconocido'}`;
    case 'DIS': return `Entrada digital ${id} · ${t === 1 ? 'ACTIVA' : 'INACTIVA'}`;
    case 'SOS': return `Entrada digital ${id} disparó el SOS`;
    case 'IOB': return `IO Bind ${id} · ${t === 1 ? 'cumple la condición de alarma' : 'no cumple la condición'}`;
    case 'SPD': return `Tipo de alarma ${id} · ${t === 1 ? 'DENTRO del rango de velocidad (alarma)' : 'FUERA del rango de velocidad'}`;
    case 'DOG': return `Entrada ${id} · ${DOG_TYPE[t] || 'tipo ' + t}`;
    case 'IGL': return t === 0 ? 'Ignición ENCENDIDA' : t === 1 ? 'Ignición APAGADA' : `Tipo ${t}`;
    case 'VGL': return `Fuente: ${VIRT_MODE[id] || 'modo ' + id} · ${t === 0 ? 'Ignición ENCENDIDA' : 'Ignición APAGADA'}`;
    case 'HBM': return `Velocidad ${HBM_SPEED[id] || id} · ${HBM_TYPE[t] || 'tipo ' + t}`;
    case 'EPS': return t === 1 ? 'Voltaje DENTRO del rango de alarma' : 'Voltaje FUERA del rango de alarma';
    case 'AIS': return `Entrada analógica ${id} · ${t === 1 ? 'DENTRO del rango de alarma' : 'FUERA del rango de alarma'}`;
    case 'SPE': return t === 1 ? 'Velocidad SUPERA el umbral dentro de la geocerca' : 'Velocidad bajo el umbral o fuera de la geocerca';
    case 'TMP': return `Alarma ${id} · ${t === 1 ? 'DENTRO del rango' : 'FUERA del rango'}`;
    default: return `Report ID ${id} · Report Type ${tc}`;
  }
}
function ridClass(msg, v) {
  const t = parseInt((v || '00')[1], 16);
  if (['SPD', 'SPE', 'EPS', 'AIS', 'IOB', 'TMP'].includes(msg)) return t === 1 ? 'val-error' : 'val-ok';
  return 'val-status';
}

// =====================================================================
//  CONTEXTO DE DECODIFICACIÓN
// =====================================================================
class Ctx {
  constructor(f, start, end) {
    this.f = f; this.i = start; this.end = end;
    this.sections = []; this.sec = null;
    this.warnings = []; this.positions = []; this.data = {}; this.missing = 0;
    this.opts = {};
  }
  section(title, kind = '') { this.sec = { title, kind, fields: [] }; this.sections.push(this.sec); return this; }
  has(n = 1) { return this.i + n - 1 < this.end; }
  peek(o = 0) { return this.f[this.i + o]; }
  add(idx, def, v) {
    if (!this.sec) this.section('CAMPOS');
    const value = v ?? '';
    const desc = typeof def.d === 'function' ? def.d(value, this) : (def.d || '');
    const human = def.h ? def.h(value, this) : '';
    const cls = typeof def.c === 'function' ? def.c(value, this) : (def.c || 'val-default');
    const f = { idx, name: def.n, value, desc, human, cls, unit: def.u || '', reserved: !!def.r };
    this.sec.fields.push(f);
    if (def.k) this.data[def.k] = value;
    return f;
  }
  // Lee el siguiente campo del cuerpo. Si falta, se marca (salvo campos opcionales/reservados al final).
  take(def) {
    if (this.i >= this.end) {
      if (def.opt) return undefined;
      this.missing++;
      if (!this.sec) this.section('CAMPOS');
      this.sec.fields.push({ idx: null, name: def.n, value: '', desc: 'Campo ausente en la trama', human: '', cls: 'val-error', unit: '', missing: true });
      return '';
    }
    const idx = this.i++;
    this.add(idx, def, this.f[idx]);
    return this.f[idx];
  }
  takeAll(defs) { return defs.map(d => this.take(d)); }
  rest(title, label = 'Campo') {
    if (this.i >= this.end) return;
    this.section(title, 'raw');
    while (this.i < this.end) {
      const idx = this.i;
      this.take({ n: `${label} [${idx}]`, d: 'Dato no decodificado en detalle' });
    }
  }
}

// ---- Definiciones de campos comunes ----
const RES = { n: 'Reservado', r: true, c: 'val-faint', d: 'Campo reservado por el protocolo' };
const RES_OPT = Object.assign({}, RES, { opt: true });
const RID = msg => ({ n: 'Report ID / Report Type', c: v => ridClass(msg, v), d: v => ridText(msg, v), k: 'reportIdType' });
const NUM = { n: 'Número de posiciones', d: 'Cantidad de posiciones GNSS en el mensaje (normalmente 1)', k: 'number' };
const MILEAGE = { n: 'Odómetro (Mileage)', u: 'km', d: 'Kilometraje total acumulado', k: 'mileage' };
const HOURS = { n: 'Horómetro (Hour Meter)', d: v => v ? 'Horas de motor encendido (AT+GTHMC)' : 'Vacío: AT+GTHMC desactivado', h: fmtHourMeter, k: 'hourMeter' };
const EXTPWR = { n: 'Voltaje alimentación externa', u: 'mV', c: 'val-status', h: mvToV, d: v => v ? 'Voltaje de la fuente principal' : 'Vacío: AT+GTEPS no configurado para reportarlo', k: 'externalPowerVoltage' };
const AI = (n, max) => ({ n: `Entrada analógica ${n}`, u: 'mV', c: 'val-status', h: analogHuman, d: v => v ? `Voltaje (0–${max} mV) o nivel de combustible "Fxx"` : 'Vacío: AT+GTAIS no configurado', k: `analogInput${n}` });
const BACKUP_PCT = { n: 'Batería de respaldo', u: '%', c: 'val-status', d: 'Nivel de la batería interna', k: 'backupBatteryPercent' };
const DEVSTATUS = { n: 'Device Status', c: 'val-status', d: v => deviceStatusText(v), k: 'deviceStatus' };
const MOTION_F = { n: 'Estado de movimiento', c: 'val-status', d: v => MOTION[(v || '').toUpperCase()] || 'Desconocido', k: 'motionStatus' };
const TIME_F = (n, d, k) => ({ n, c: 'val-time', h: v => fmtTime(v), d, k });
const ICCID = { n: 'ICCID', c: 'val-id', d: 'Identificador de la tarjeta SIM', k: 'iccid' };
const CSQ_F = { n: 'CSQ RSSI / RSRP', c: v => { const n = parseInt(v, 10); return n === 99 || n === 255 ? 'val-default' : n >= 15 ? 'val-ok' : n >= 8 ? 'val-status' : 'val-error'; }, d: (v, c) => csqText(v, c.data.networkType), k: 'csq' };
const BER_F = { n: 'CSQ BER', d: v => v === '99' ? 'Calidad desconocida' : 'Tasa de error 0–7 (menor = mejor)', k: 'ber' };
const EXT_SUPPLY = { n: 'Alimentación externa', c: v => v === '1' ? 'val-ok' : 'val-error', d: v => v === '1' ? 'Conectada' : 'Desconectada', k: 'externalPowerSupply' };
const BACKUP_V = { n: 'Voltaje batería de respaldo', u: 'V', c: 'val-status', d: 'Válido solo cuando la alimentación externa está desconectada', k: 'backupBatteryVoltage' };
const CHARGING = { n: 'Cargando', c: v => v === '1' ? 'val-ok' : 'val-default', d: v => v === '1' ? 'La batería de respaldo está cargando' : 'No está cargando', k: 'charging' };
const LED = { n: 'Estado LED', d: v => v === '1' ? 'Al menos un LED encendido' : 'Todos los LED apagados', k: 'led' };
const DI_F = { n: 'Entradas digitales', c: 'val-status', d: v => ioBits(v, 'in'), k: 'digitalInput' };
const DO_F = { n: 'Salidas digitales', c: 'val-status', d: v => ioBits(v, 'out'), k: 'digitalOutput' };
const TZ_F = { n: 'Zona horaria', d: 'Desfase de la hora local respecto a UTC', k: 'timeZone' };
const DST_F = { n: 'Horario de verano', d: v => v === '1' ? 'Activado' : 'Desactivado', k: 'daylightSaving' };
const DUR = (n, d, k) => ({ n, u: 's', c: 'val-status', h: fmtDuration, d, k });

// =====================================================================
//  BLOQUE GNSS
// =====================================================================
function gnssBlock(c, { trigger = false, label = 'POSICIÓN GNSS' } = {}) {
  c.section(label, 'gnss');
  const acc = c.take({ n: 'Precisión GNSS (HDOP)', c: v => v === '0' ? 'val-error' : 'val-gnss', d: v => v === '0' ? 'Fix GNSS fallido: se reporta la última posición conocida' : v === '' ? 'Sin dato' : `Fix válido · HDOP ${v} (menor = mejor)`, k: 'gnssAccuracy' });
  const speed = c.take({ n: 'Velocidad', u: 'km/h', c: 'val-gnss', d: 'Velocidad GNSS', k: 'speed' });
  const az = c.take({ n: 'Azimut (rumbo)', u: '°', c: 'val-gnss', d: v => v !== '' ? `Rumbo ${cardinal(v)} (0° = Norte)` : '', k: 'azimuth' });
  const alt = c.take({ n: 'Altitud', u: 'm', c: 'val-gnss', d: 'Altura sobre el nivel del mar', k: 'altitude' });
  let lon = c.take({ n: 'Longitud', c: 'val-gnss', d: 'WGS-84 · negativo = Oeste', k: 'longitude' });
  const lat = c.take({ n: 'Latitud', c: 'val-gnss', d: 'WGS-84 · negativo = Sur', k: 'latitude' });
  const utc = c.take(TIME_F('Hora GNSS (UTC)', 'Hora UTC del chip GNSS', 'gnssUtcTime'));

  if (c.opts.forceWest && isNum(lon) && parseFloat(lon) > 0) {
    const fld = c.sec.fields.find(x => x.name === 'Longitud');
    lon = '-' + lon;
    if (fld) { fld.human = lon; fld.desc += ' · corregida a Oeste por la opción "Forzar longitud Oeste"'; }
  }

  c.section('CELDA (LBS)', 'cell');
  const mcc = c.take({ n: 'MCC', c: 'val-cell', d: v => `Código de país${MCC[String(parseInt(v, 10))] ? ': ' + MCC[String(parseInt(v, 10))] : ''}`, k: 'mcc' });
  c.take({ n: 'MNC', c: 'val-cell', d: v => { const name = String(parseInt(mcc, 10)) === '732' ? MNC_CO[String(parseInt(v, 10)).padStart(3, '0')] : ''; return 'Código de operador' + (name ? ': ' + name : ''); }, k: 'mnc' });
  c.take({ n: 'LAC / TAC', c: 'val-cell', d: v => Number.isFinite(hexv(v)) ? `Área de localización (hex) = ${hexv(v)} decimal` : 'Área de localización (hex)', k: 'lac' });
  c.take({ n: 'Cell ID', c: 'val-cell', d: v => { const n = hexv(v); if (!Number.isFinite(n)) return 'ID de celda (hex)'; return v.length === 8 ? `= ${n} decimal · LTE eNB ${Math.floor(n / 256)}, sector ${n % 256}` : `= ${n} decimal`; }, k: 'cellId' });

  c.section('MÁSCARA DE POSICIÓN', 'gnss');
  const mask = c.take({ n: 'Position Append Mask', c: 'val-status', d: v => appendMaskText(v, trigger), k: 'positionAppendMask' });
  const m = hexv(mask) || 0;
  if (bit(m, 0)) c.take({ n: 'Satélites en uso', c: 'val-gnss', d: 'Satélites usados para esta posición (bit 0)', k: 'satellites' });
  if (trigger && bit(m, 1)) c.take({ n: 'Tipo de punto GNSS', c: 'val-gnss', d: v => GNSS_TRIGGER[v] || 'Desconocido', k: 'gnssTriggerType' });
  if (bit(m, 4)) c.take({ n: 'Estado de jamming GNSS', c: v => v === '1' ? 'val-ok' : v === '0' || v === '' ? 'val-default' : 'val-error', d: v => v === '' ? 'Vacío (hardware 2.01 no lo soporta)' : (JAM_STATE[v] || 'Desconocido'), k: 'gnssJammingState' });

  const pos = { lat, lon, acc, speed, azimuth: az, altitude: alt, utc };
  c.positions.push(pos);
  return pos;
}
function appendMaskText(v, trigger) {
  const n = hexv(v);
  if (!Number.isFinite(n)) return v ? 'Formato inesperado' : 'Vacío';
  const items = [];
  if (bit(n, 0)) items.push('bit 0: satélites en uso');
  if (bit(n, 1)) items.push(trigger ? 'bit 1: tipo de punto GNSS' : 'bit 1: (solo FRI/ERI)');
  if (bit(n, 4)) items.push('bit 4: estado de jamming GNSS');
  const other = n & ~0x13;
  if (other) items.push(`bits reservados 0x${other.toString(16).toUpperCase()}`);
  return items.length ? items.join(' · ') : 'Sin campos opcionales';
}

// =====================================================================
//  DEFINICIONES POR MENSAJE (+RESP / +BUFF)
//  pre: campos antes del bloque GNSS · post: campos después · fields: sin GNSS
// =====================================================================
const GENERIC_LOC = ['TOW', 'DIS', 'IOB', 'SPD', 'SOS', 'RTL', 'DOG', 'IGL', 'VGL', 'HBM'];
const SPECS = {};
GENERIC_LOC.forEach(m => { SPECS[m] = { title: 'REPORTE DE UBICACIÓN', pre: [RES, RID(m), NUM], post: [MILEAGE] }; });
SPECS.EPS = { title: 'ALARMA DE ALIMENTACIÓN EXTERNA', pre: [EXTPWR, RID('EPS'), NUM], post: [MILEAGE] };
SPECS.AIS = { title: 'ALARMA DE ENTRADA ANALÓGICA', pre: [{ n: 'Voltaje entrada analógica', u: 'mV', c: 'val-status', h: mvToV, k: 'analogInputVoltage' }, RID('AIS'), NUM], post: [MILEAGE] };
SPECS.LBC = { title: 'UBICACIÓN POR LLAMADA', pre: [{ n: 'Número que llamó', c: 'val-id', d: 'Teléfono que solicitó la ubicación', k: 'callNumber' }], post: [] };
SPECS.IDA = { title: 'AUTENTICACIÓN DE ID', pre: [RES, { n: 'ID', c: 'val-id', d: 'ID del conductor (iButton/RFID)', k: 'id' }, { n: 'Tipo de reporte ID', d: v => ({ '0': 'ID no autorizado', '1': 'ID autorizado', '2': 'ID retirado/desconectado', '3': 'Tipo 3' }[v] || ''), k: 'idReportType' }, NUM], post: [MILEAGE] };
SPECS.GES = { title: 'GEOCERCA DE ESTACIONAMIENTO', pre: [RES, { n: 'Report ID / Report Type', c: 'val-status', d: v => /^[0-9A-F]{3}$/i.test(v) ? `Geocerca ${parseInt(v.slice(0, 2), 16)} · ${v[2] === '1' ? 'ACTIVA' : 'INACTIVA'}` : '', k: 'reportIdType' }, { n: 'Modo de disparo', k: 'triggerMode' }, { n: 'Radio', u: 'm', k: 'radius' }, { n: 'Intervalo de chequeo', u: 's', k: 'checkInterval' }, NUM], post: [MILEAGE] };
SPECS.GIN = SPECS.GOT = { title: 'GEOCERCA', custom: 'geo', post: [MILEAGE] };
SPECS.SPE = { title: 'VELOCIDAD EN GEOCERCA', pre: [{ n: 'Group ID', k: 'groupId' }, RES, RES, RID('SPE'), NUM], post: [MILEAGE] };
SPECS.ETI = { title: 'PEAJE ELECTRÓNICO', pre: [RES, RES, NUM], post: [RES, MILEAGE, HOURS, RES, RES, RES, RES, DEVSTATUS, RES_OPT, RES_OPT, RES_OPT] };
['MPN', 'MPF', 'BTC'].forEach(m => { SPECS[m] = { title: 'EVENTO DE ALIMENTACIÓN', pre: [], post: [] }; });
SPECS.STC = { title: 'BATERÍA DEJA DE CARGAR', pre: [RES], post: [] };
SPECS.BPL = { title: 'BATERÍA DE RESPALDO BAJA', pre: [BACKUP_V], post: [] };
SPECS.JDR = { title: 'JAMMING DE RED', pre: [{ n: 'Red con jamming', c: 'val-error', d: v => JAM_NET[v] || '', k: 'jammingNet' }], post: [] };
SPECS.JDS = { title: 'ESTADO DE JAMMING DE RED', pre: [{ n: 'Estado de jamming', c: 'val-error', d: v => ({ '1': 'Sale del estado de jamming', '2': 'ENTRA en estado de jamming', '5': 'Sale del estado de advertencia', '6': 'ENTRA en estado de advertencia' }[v] || ''), k: 'jammingStatus' }, { n: 'Red con jamming', d: v => JAM_NET[v] || '', k: 'jammingNet' }], post: [] };
SPECS.GPJ = { title: 'JAMMING GNSS', pre: [{ n: 'Valor de jamming CW', d: 'Interferencia de onda continua (0–255)', k: 'cwJamming' }, { n: 'Estado de jamming GNSS', c: 'val-error', d: v => JAM_STATE[v] || '', k: 'gnssJamming' }], post: [] };
SPECS.STT = { title: 'CAMBIO DE ESTADO', pre: [MOTION_F], post: [] };
SPECS.IGN = { title: 'MOTOR ENCENDIDO', pre: [DUR('Tiempo con ignición apagada', 'Tiempo desde el último apagado', 'ignitionOffDuration')], post: [HOURS, MILEAGE] };
SPECS.IGF = { title: 'MOTOR APAGADO', pre: [DUR('Tiempo con ignición encendida', 'Duración del ciclo de encendido', 'ignitionOnDuration')], post: [HOURS, MILEAGE] };
const VIRT_TYPE = { n: 'Report Type (fuente)', c: 'val-status', d: v => VIRT_MODE[v] || 'Desconocido', k: 'virtualIgnitionType' };
SPECS.VGN = { title: 'ENCENDIDO VIRTUAL', pre: [RES, VIRT_TYPE, DUR('Tiempo con ignición apagada', 'Tiempo desde el último apagado', 'ignitionOffDuration')], post: [HOURS, MILEAGE] };
SPECS.VGF = { title: 'APAGADO VIRTUAL', pre: [RES, VIRT_TYPE, DUR('Tiempo con ignición encendida', 'Duración del ciclo de encendido', 'ignitionOnDuration')], post: [HOURS, MILEAGE] };
SPECS.IDN = { title: 'ENTRA EN RALENTÍ', pre: [RES, RES], post: [MILEAGE] };
SPECS.IDF = { title: 'SALE DE RALENTÍ', pre: [MOTION_F, DUR('Duración del ralentí', 'Tiempo que estuvo en ralentí', 'idleDuration')], post: [MILEAGE] };
SPECS.GSS = { title: 'SEÑAL GNSS', pre: [{ n: 'Estado señal GNSS', c: v => v === '1' ? 'val-ok' : 'val-error', d: v => v === '1' ? 'Señal recuperada, fix exitoso' : 'Señal perdida o fix fallido', k: 'gnssSignalStatus' }, { n: 'Satélites', d: 'Satélites en seguimiento (nibble bajo)', k: 'satelliteNumber' }, MOTION_F, RES], post: [] };
['STR', 'STP', 'LSP'].forEach(m => { SPECS[m] = { title: 'ESTADO DE VIAJE', pre: [RES, RES], post: [MILEAGE] }; });
SPECS.DOS = { title: 'SALIDA DIGITAL (WAVE SHAPE 1)', pre: [{ n: 'Salida (Wave1 Output ID)', c: 'val-id', d: v => `Salida ${v}`, k: 'outputId' }, { n: 'Estado de la salida', c: v => v === '1' ? 'val-ok' : 'val-default', d: v => ({ '0': 'Inactiva', '1': 'Activa', '2': 'En transición gradual (wave shape)' }[v] || ''), k: 'outputActive' }], post: [] };
SPECS.RMD = { title: 'ROAMING', pre: [{ n: 'Estado de roaming', c: v => v === '0' ? 'val-ok' : 'val-status', d: v => ({ '0': 'Red local', '1': 'Roaming conocido', '2': 'Roaming desconocido', '3': 'Reporte bloqueado' }[v] || ''), k: 'roamingState' }], post: [] };
SPECS.CRA = { title: 'COLISIÓN', pre: [{ n: 'Contador de choques', c: 'val-error', d: 'Secuencia del choque (00–FF), enlaza +RESP:GTCRA con +RESP:GTCRD', k: 'crashCounter' }], post: [] };
SPECS.TMP = { title: 'ALARMA DE TEMPERATURA', pre: [RES, EXTPWR, RID('TMP'), NUM], post: [MILEAGE, HOURS] };
SPECS.BCS = SPECS.BDS = { title: 'BLUETOOTH', pre: [RES], post: [] };

// Mensajes sin bloque GNSS
const INFO_SPECS = {
  PNA: [], PFA: [], PDP: [],
  PNR: [{ n: 'Motivo de encendido', c: 'val-status', d: v => ({ '0': 'Encendido normal', '1': 'Reinicio por FOTA', '2': 'Reinicio por RTO', '3': 'Reinicio por watchdog', '5': 'Reinicio por watchdog del sistema', '6': 'Reinicio por actualización de configuración' }[v] || ''), k: 'powerOnReason' }, RES_OPT, RES_OPT, RES_OPT, RES_OPT],
  PFR: [{ n: 'Motivo de apagado', c: 'val-status', d: v => ({ '0': 'Apagado por RTO', '1': 'Voltaje de batería bajo', '2': 'Reinicio por RTO', '3': 'Reinicio por watchdog' }[v] || ''), k: 'powerOffReason' }, RES_OPT, RES_OPT, RES_OPT, RES_OPT],
  INF: [MOTION_F, ICCID, CSQ_F, BER_F, EXT_SUPPLY, EXTPWR,
    { n: 'Tipo de red', c: 'val-cell', d: v => ({ '0': 'No registrado', '1': 'EGPRS', '2': 'Reservado', '3': 'LTE' }[v] || ''), k: 'networkType' },
    BACKUP_V, CHARGING, LED, RES, RES, TIME_F('Último fix (UTC)', 'Hora UTC del último fix GNSS exitoso', 'lastFixUtc'), RES,
    AI(1, 16000), AI(2, 16000), AI(3, 30000), DI_F, DO_F, TZ_F, DST_F],
  GPS: [RES, RES, RES, { n: 'Report Item Mask', d: 'Ver <Report Item Mask> de AT+GTCFG', k: 'reportItemMask' }, RES, RES, TIME_F('Último fix (UTC)', 'Hora UTC del último fix GNSS exitoso', 'lastFixUtc')],
  CID: [ICCID],
  CSQ: [CSQ_F, BER_F],
  VER: [{ n: 'Tipo de dispositivo', c: 'val-id', d: v => DEVICE_TYPES[(v || '').toUpperCase()] || '', k: 'deviceType' },
    { n: 'Versión de software', c: 'val-ok', h: v => /^[0-9A-F]{4}$/i.test(v) ? `v${parseInt(v.slice(0, 2), 16)}.${String(parseInt(v.slice(2), 16)).padStart(2, '0')}` : '', d: 'Mayor (2 hex) + menor (2 hex)', k: 'softwareVersion' },
    { n: 'Versión de hardware', c: 'val-ok', h: v => /^[0-9A-F]{4}$/i.test(v) ? `v${parseInt(v.slice(0, 2), 16)}.${String(parseInt(v.slice(2), 16)).padStart(2, '0')}` : '', d: 'Mayor (2 hex) + menor (2 hex)', k: 'hardwareVersion' }],
  BAT: [EXT_SUPPLY, EXTPWR, RES, BACKUP_V, CHARGING, LED],
  IOS: [RES, AI(1, 16000), AI(2, 16000), AI(3, 30000), DI_F, DO_F],
  TMZ: [TZ_F, DST_F, { n: 'Verificación de hora por red', d: v => v === '1' ? 'Activada' : 'Desactivada', k: 'networkTimeChecking' }],
  AIF: [{ n: 'APN', k: 'apn' }, { n: 'Usuario APN', k: 'apnUser' }, { n: 'Contraseña APN', k: 'apnPassword' }, { n: 'APN de respaldo', k: 'backupApn' }, { n: 'Usuario APN respaldo' }, { n: 'Contraseña APN respaldo' },
    ICCID, CSQ_F, BER_F, { n: 'Cell ID', c: 'val-cell', d: 'Celda servidora (hex)', k: 'cellId' }, { n: 'Dirección IP', c: 'val-id', k: 'ip' }, { n: 'DNS principal', k: 'dns1' }, { n: 'DNS de respaldo', k: 'dns2' }, RES_OPT, RES_OPT, RES_OPT, RES_OPT],
};

// =====================================================================
//  FRI / ERI
// =====================================================================
function decodeFRI(c, msg) {
  const eri = msg === 'ERI';
  c.section('DATOS DEL REPORTE', 'status');
  let eriMask = 0;
  if (eri) {
    const v = c.take({ n: 'ERI Mask', c: 'val-status', d: eriMaskText, k: 'eriMask' });
    eriMask = hexv(v) || 0;
  }
  c.take(EXTPWR);
  c.take(RID(msg));
  const num = c.take({ n: 'Número de posiciones', d: 'Puntos GNSS en el mensaje (1–15). Si hay varios, el bloque GNSS se repite.', k: 'number' });
  const count = Math.max(1, Math.min(15, parseInt(num, 10) || 1));
  for (let k = 0; k < count; k++) gnssBlock(c, { trigger: true, label: count > 1 ? `POSICIÓN GNSS ${k + 1} DE ${count}` : 'POSICIÓN GNSS' });

  c.section('TELEMETRÍA', 'status');
  c.takeAll(ACTIVE.fri.telemetry);
  if (!eri) { c.takeAll(ACTIVE.fri.tail); return; }
  ACTIVE.fri.eri(c, eriMask);
}
function eriMaskText(v) {
  const n = hexv(v);
  if (!Number.isFinite(n)) return 'Formato inesperado';
  const items = [];
  const names = (ACTIVE && ACTIVE.eriBits) || {};
  for (let b = 0; b < 32; b++) if (bit(n, b)) items.push(`bit ${b}: ${names[b] || 'reservado'}`);
  return items.length ? items.join(' · ') : 'Sin datos de periféricos';
}
// Bloques opcionales de ERI en el orden del GV350CEU (combustible, 1-Wire, CAN, combustible, RF433, BT, RAT).
function decodeEriOptional(c, mask) {
  if (bit(mask, 0) && !bit(mask, 29)) {
    c.section('SENSOR DE COMBUSTIBLE DIGITAL', 'status');
    c.take({ n: 'Datos del sensor de combustible', d: 'Dato crudo del sensor digital (ERI bit 0)', k: 'digitalFuelSensorData' });
  }
  if (bit(mask, 29)) { c.rest('DATOS EXPANDIDOS DE COMBUSTIBLE (ERI bit 29) Y SIGUIENTES'); return; }
  if (bit(mask, 1)) decodeOneWire(c);
  if (bit(mask, 2)) { c.rest('DATOS CAN (ERI bit 2 · formato según AT+GTCAN) Y SIGUIENTES', 'CAN'); return; }
  if (bit(mask, 3) || bit(mask, 4)) {
    c.section('SENSORES DE COMBUSTIBLE', 'status');
    const n = parseInt(c.take({ n: 'Número de sensores', k: 'fuelSensorCount' }), 10) || 0;
    const FUEL_TYPE = { '0': 'EPSILON ES2/ES4', '1': 'LLS 20160', '2': 'DUT-E', '3': 'QFS100', '4': 'UFSxxx (RS232)', '5': 'Reservado', '6': 'DUT-E SUM', '20': 'ADC1', '21': 'ADC2', '22': 'ADC3' };
    for (let k = 1; k <= n && c.has(); k++) {
      const t = c.take({ n: `Sensor #${k} · Tipo`, d: v => FUEL_TYPE[v] || '' });
      if (bit(mask, 3)) c.take({ n: `Sensor #${k} · Porcentaje`, u: '%', c: 'val-status' });
      if (bit(mask, 4)) c.take({ n: `Sensor #${k} · Volumen`, u: 'L', c: 'val-status' });
      if (bit(mask, 10) && (t === '2' || t === '6')) c.take({ n: `Sensor #${k} · Temperatura combustible`, u: '°C' });
    }
  }
  if (bit(mask, 7)) {
    c.section('ACCESORIOS RF433', 'status');
    const n = parseInt(c.take({ n: 'Número de accesorios RF433', k: 'rf433Count' }), 10) || 0;
    for (let k = 1; k <= n && c.has(); k++) {
      c.take({ n: `RF433 #${k} · Número de serie`, c: 'val-id' });
      const t = c.take({ n: `RF433 #${k} · Tipo`, d: v => ({ '1': 'WTS100 (temperatura)', '2': 'WTH100 (temperatura y humedad)' }[v] || '') });
      c.take({ n: `RF433 #${k} · Temperatura`, u: '°C', c: 'val-status' });
      if (t === '2') c.take({ n: `RF433 #${k} · Humedad`, u: '%', c: 'val-status' });
    }
  }
  if (bit(mask, 8)) decodeBtAccessories(c);
  if (bit(mask, 15)) decodeRatBand(c);
}
function decodeOneWire(c) {
  c.section('1-WIRE', 'status');
  const n = parseInt(c.take({ n: 'Número de dispositivos 1-Wire', k: 'oneWireCount' }), 10) || 0;
  for (let k = 1; k <= n && c.has(); k++) {
    c.take({ n: `1-Wire #${k} · ID`, c: 'val-id' });
    const type = c.take({ n: `1-Wire #${k} · Tipo`, d: v => ({ '1': 'Sensor de temperatura', '3': 'Sensor HTDZ', '4': 'Sensor TH200' }[v] || '') });
    c.take({ n: `1-Wire #${k} · Dato`, c: 'val-status', h: v => type === '1' ? oneWireTemp(v) : '', d: type === '1' ? 'Complemento a dos × 0.0625 °C' : '' });
  }
}
function decodeRatBand(c) {
  c.section('RAT Y BANDA', 'cell');
  c.take({ n: 'RAT', c: 'val-cell', d: v => ({ '0': 'Sin servicio', '1': 'EGPRS', '4': 'LTE Cat1' }[v] || ''), k: 'rat' });
  c.take({ n: 'Banda', c: 'val-cell', d: v => v === '0' ? 'Banda inválida' : Number(v) > 100 ? `GSM ${v}` : `Banda ${v}`, k: 'band' });
}
function oneWireTemp(v) {
  const n = hexv(v);
  if (!Number.isFinite(n)) return '';
  const bits = v.length * 4;
  const signed = n >= Math.pow(2, bits - 1) ? n - Math.pow(2, bits) : n;
  return (signed * 0.0625).toFixed(2) + ' °C';
}
const BT_MASK_FIELDS = {
  0: [['Nombre']], 1: [['MAC']], 2: [['Estado de conexión', '', v => v === '1' ? 'Conectado' : 'Desconectado']],
  3: [['Voltaje de batería', 'mV']], 4: [['Temperatura', '°C']], 5: [['Humedad', '%RH']],
  7: [['Estado de salidas'], ['Estado de entradas digitales'], ['Voltaje entrada analógica', 'mV']],
  8: [['Modo'], ['Evento']], 9: [['Presión de llanta', 'kPa']], 10: [['Timestamp', '', v => fmtTime(v)]],
  11: [['Temperatura de precisión', '°C']], 12: [['Magnet ID'], ['Contador de eventos MAG'], ['Estado del imán', '', v => v === '1' ? 'Cerrado' : 'Separado']],
  13: [['Batería', '%']], 14: [['Estado del relé']], 16: [['Aceleración triaxial', '', triAxial]], 17: [['Ángulos', '', angles]],
  18: [['Event Mask'], ['Tilt Event'], ['Motion Event'], ['Crash Event'], ['Falling Event']], 19: [['Move Event']],
  21: [['RSSI', 'dBm']], 23: [['Número de serie del dispositivo'], ['Identificador del sensor']],
};
function decodeBtAccessories(c) {
  c.section('ACCESORIOS BLUETOOTH', 'status');
  const n = parseInt(c.take({ n: 'Número de accesorios Bluetooth', k: 'btAccessoryCount' }), 10) || 0;
  for (let k = 1; k <= n && c.has(); k++) {
    c.section(`ACCESORIO BLUETOOTH ${k} DE ${n}`, 'status');
    c.take({ n: 'Índice', c: 'val-id' });
    c.take({ n: 'Tipo de accesorio', c: 'val-id', d: v => BT_TYPE[parseInt(v, 10)] || 'Desconocido' });
    c.take({ n: 'Modelo' });
    c.take({ n: 'Dato crudo', c: 'val-status', d: 'Depende del tipo y modelo (ver AT+GTBAS)' });
    const mv = c.take({ n: 'Accessory Append Mask', c: 'val-status', d: btMaskText });
    const mask = btMaskValue(mv);
    for (let b = 0; b < 32; b++) {
      if (!bit(mask, b) || !BT_MASK_FIELDS[b]) continue;
      for (const [name, unit, human] of BT_MASK_FIELDS[b]) c.take({ n: name, u: unit || '', h: human, d: `Bit ${b} de la máscara del accesorio` });
    }
  }
}
function btMaskValue(v) {
  if (!/^[0-9A-F]{4}([0-9A-F]{4})?$/i.test(v || '')) return 0;
  const low = parseInt(v.slice(0, 4), 16);
  const high = v.length === 8 && bit(low, 15) ? parseInt(v.slice(4), 16) : 0;
  return high * 65536 + low;
}
function btMaskText(v) {
  const m = btMaskValue(v);
  const names = [];
  for (let b = 0; b < 32; b++) if (bit(m, b) && BT_MASK_FIELDS[b]) names.push(BT_MASK_FIELDS[b].map(x => x[0]).join(', '));
  return names.length ? names.join(' · ') : 'Sin campos adicionales';
}
function triAxial(v) {
  if (!/^[0-9A-F]{12}$/i.test(v || '')) return '';
  const s = h => { const n = parseInt(h, 16); return n >= 0x8000 ? n - 0x10000 : n; };
  return `X ${s(v.slice(0, 4))} mg · Y ${s(v.slice(4, 8))} mg · Z ${s(v.slice(8, 12))} mg`;
}
function angles(v) {
  if (!/^[0-9A-F]{6}$/i.test(v || '')) return '';
  const a = h => (h.toUpperCase() === 'FF' ? 'inválido' : parseInt(h, 16) + '°');
  return `X ${a(v.slice(0, 2))} · Y ${a(v.slice(2, 4))} · Z ${a(v.slice(4, 6))}`;
}

// ---- GIN / GOT ----
function decodeGeo(c) {
  c.section('GEOCERCA', 'status');
  c.take(RES);
  const fmt = c.take({ n: 'Formato de ID', d: v => v === '0' ? 'Formato máscara (cada geocerca es un bit)' : v === '1' ? 'Formato grupo (Group ID + rango de GEO ID)' : '', k: 'idReportFormat' });
  c.take({ n: 'Tipo de área', d: v => v === '0' ? 'Polígono' : v === '1' ? 'Circular' : '', k: 'areaType' });
  if (fmt === '1') c.takeAll([{ n: 'Área (máscara)', k: 'areaMask' }, { n: 'Group ID', k: 'groupId' }, { n: 'GEO ID inicial', k: 'startGeoId' }, { n: 'GEO ID final', k: 'endGeoId' }]);
  else c.takeAll([1, 2, 3, 4].map(i => ({ n: `Área máscara ${i}`, d: v => geoMaskText(v, i), k: `areaMask${i}` })));
  c.take(RES);
  c.take(NUM);
}
function geoMaskText(v, part) {
  const n = hexv(v);
  if (!Number.isFinite(n) || !n) return v ? 'Ninguna geocerca' : 'Vacío';
  const ids = [];
  for (let b = 0; b < 32; b++) if (bit(n, b)) ids.push(b + (part - 1) * 20);
  return `Geocerca(s): ${ids.join(', ')}`;
}

// =====================================================================
//  DECODIFICADOR PRINCIPAL
// =====================================================================
function splitFrames(raw) {
  const text = raw.trim();
  if (!text) return [];
  if (text.includes('$')) return text.replace(/[\r\n]+/g, '').split('$').map(s => s.trim()).filter(Boolean);
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function parseHeader(h) {
  const s = (h || '').trim().toUpperCase();
  let m = /^\+?(RESP|BUFF|ACK|SACK):GT([A-Z0-9]{3})$/.exec(s);
  if (m) return { kind: m[1], msg: m[2] };
  m = /^(RESP|BUFF|ACK|SACK)\s?GT([A-Z0-9]{3})$/.exec(s.replace(/^\+/, ''));
  if (m) return { kind: m[1], msg: m[2], legacy: true };
  return null;
}

function msgInfo(msg) {
  return (ACTIVE && ACTIVE.messages && ACTIVE.messages[msg]) || MSG_INFO[msg] || ['default', `Mensaje GT${msg}`];
}

function decodeOne(rawFrame, opts = {}) {
  const raw = rawFrame.replace(/\$+$/, '').trim();
  const f = raw.split(',').map(s => s.trim());
  const res = { raw, f, kind: '', msg: '', sections: [], warnings: [], positions: [], data: {}, roles: {} };
  const detected = detectModel(f[1]);
  ACTIVE = detected || opts.model || MODELS[0];
  res.model = ACTIVE;
  res.modelDetected = !!detected;
  if (opts.model && detected && detected !== opts.model) res.modelSwitched = true;

  if (/^[0-9A-F]{20,}$/i.test(raw.replace(/\s/g, '')) && !raw.includes(',')) {
    res.error = 'Parece una trama en formato HEX. Este decodificador solo interpreta el formato ASCII.';
    return res;
  }
  // +SACK:11F0  (acuse de servidor simple)
  const sackShort = /^\+?SACK:([0-9A-F]{4})$/i.exec(raw);
  if (sackShort) {
    res.kind = 'SACK'; res.msg = '';
    res.sections = [{ title: 'SERVER ACK', kind: 'ack', fields: [
      { idx: 0, name: 'Server ACK + Count Number', value: raw, desc: `El servidor confirma el mensaje con Count Number ${sackShort[1].toUpperCase()}`, human: '', cls: 'val-header', unit: '' }] }];
    res.data = { countNumber: sackShort[1] };
    return res;
  }

  const hdr = parseHeader(f[0]);
  if (!hdr) {
    if (f.length < 4) { res.error = 'No se reconoce el formato. Verifica que la trama esté completa y separada por comas.'; return res; }
    res.kind = 'UNKNOWN'; res.msg = f[0];
  } else { res.kind = hdr.kind; res.msg = hdr.msg; }
  if (hdr && hdr.legacy) res.warnings.push(`Cabecera sin formato estándar ("${f[0]}"); se interpretó como +${hdr.kind}:GT${hdr.msg}.`);

  const n = f.length;
  const c = new Ctx(f, 0, n);
  c.opts = opts;
  const pv = decodeProtocolVersion(f[1]);
  res.pv = pv;

  // ---- SACK:GTHBD ----
  if (res.kind === 'SACK') {
    c.section('CABECERA', 'header');
    c.take({ n: 'Cabecera', c: 'val-header', d: 'Acuse del servidor (Server ACK)' });
    c.take({ n: 'Versión de protocolo', c: 'val-header', d: `${pv.devName} · protocolo ${pv.version}`, k: 'protocolVersion' });
    c.end = n;
    while (c.i < n - 1) c.take({ n: `Campo [${c.i}]` });
    c.section('COLA', 'time');
    c.take({ n: 'Count Number', c: 'val-time', d: 'Count Number del heartbeat que se confirma', k: 'countNumber' });
    return finish(res, c);
  }

  // ---- Cabecera común ----
  c.section('CABECERA', 'header');
  c.take({ n: 'Cabecera', c: 'val-header', d: hdr ? `+${res.kind}:GT${res.msg}${res.kind === 'BUFF' ? ' · mensaje almacenado en buffer y enviado al recuperar conexión' : ''}` : 'Tipo de mensaje no reconocido' });
  c.take({ n: 'Versión de protocolo', c: pv.ok ? 'val-header' : 'val-error', d: pv.ok ? `${pv.devName} (tipo ${pv.dev}) · protocolo ${pv.version}` : 'Formato inesperado (se esperaban 6 caracteres hex, p. ej. 740D01)', k: 'protocolVersion' });
  c.take({ n: 'IMEI', c: v => /^\d{15}$/.test(v) ? 'val-id' : 'val-error', d: v => /^\d{15}$/.test(v) ? 'Identificador único del equipo' : 'El IMEI debería tener 15 dígitos', k: 'imei' });
  c.take({ n: 'Nombre del dispositivo', c: 'val-id', d: v => v ? 'Nombre configurado en el equipo' : 'Vacío: sin nombre configurado', k: 'deviceName' });

  // ---- ACK ----
  if (res.kind === 'ACK') {
    const isHbd = res.msg === 'HBD';
    const tailLen = isHbd ? 2 : 3;
    c.end = n - tailLen;
    if (!isHbd) {
      c.section('CUERPO', 'status');
      const optName = { GEO: 'GEO ID', PEO: 'Group ID', PEG: 'Group ID', IOB: 'IOB ID', TMP: 'Alarm ID', CLT: 'Group ID', CMD: 'Stored Command ID', UDF: 'Group ID', ROS: 'Output ID', FSC: 'Table ID', TTR: 'Command Type', BAS: 'Índice', BTD: 'Índice', RTO: 'Sub-comando', IDS: 'Result Code' }[res.msg];
      if (res.msg === 'IDC') c.takeAll([{ n: 'ID Number', c: 'val-id' }, { n: 'Authorised' }]);
      else if (res.msg === 'IDS') { c.take({ n: 'Result Code', d: v => ({ '0': 'Éxito', '1': 'Lista de IDs llena', '2': 'IDs duplicados descartados' }[v] || '') }); if (c.has()) c.take({ n: 'Número adicional' }); }
      else if (optName) c.take({ n: optName, d: `Opción del comando AT+GT${res.msg}` });
      while (c.has()) c.take({ n: `Opción [${c.i}]` });
    }
    c.end = n;
    c.section('COLA', 'time');
    if (!isHbd) c.take({ n: 'Número de serie del comando', c: 'val-time', d: 'Serial Number del comando AT+GT que se confirma (hex)', k: 'serialNumber' });
    c.take(TIME_F('Hora de envío', 'Hora local del equipo al generar la trama', 'sendTime'));
    c.take({ n: 'Count Number', c: 'val-time', d: 'Contador incremental 0000–FFFF', k: 'countNumber' });
    return finish(res, c);
  }

  // ---- RESP / BUFF / desconocido ----
  c.end = n - 2;
  const msg = res.msg;
  const spec = (ACTIVE.specs && ACTIVE.specs[msg]) || SPECS[msg];
  const info = (ACTIVE.info && ACTIVE.info[msg]) || INFO_SPECS[msg];
  if (msg === 'FRI' || msg === 'ERI') decodeFRI(c, msg);
  else if (spec) {
    c.section(spec.title, 'status');
    if (spec.custom === 'geo') decodeGeo(c); else c.takeAll(spec.pre);
    gnssBlock(c);
    if (spec.post.length) { c.section('DATOS ADICIONALES', 'status'); c.takeAll(spec.post); }
  } else if (info) {
    if (info.length) { c.section(msgInfo(msg)[1].split(' · ')[0].toUpperCase(), 'status'); c.takeAll(info); }
  } else if (msg === 'DAT' && n === 7) {
    c.section('DATOS', 'status');
    c.take({ n: 'Datos transparentes', k: 'data' });
  } else {
    // Mensaje no definido: buscar bloque GNSS automáticamente
    const g = findGnssStart(f, 4, c.end);
    if (g >= 0) {
      if (g > 4) { c.section('CUERPO (sin definición específica)', 'raw'); while (c.i < g) c.take({ n: `Campo [${c.i}]` }); }
      gnssBlock(c, { label: 'POSICIÓN GNSS (detectada automáticamente)' });
      res.warnings.push(`El mensaje ${msg || f[0]} no tiene definición específica; el bloque GNSS se detectó por su formato.`);
    } else if (hdr) {
      res.warnings.push(`El mensaje GT${msg} no tiene definición específica; se muestran los campos sin interpretar.`);
    }
  }
  c.rest(c.i > 4 ? 'CAMPOS EXTRA (no esperados por la definición)' : 'CUERPO DEL MENSAJE');
  c.end = n;
  c.section('COLA', 'time');
  c.take(TIME_F('Hora de envío', 'Hora local del equipo al generar la trama', 'sendTime'));
  c.take({ n: 'Count Number', c: v => /^[0-9A-F]{4}$/i.test(v) ? 'val-time' : 'val-error', d: 'Contador incremental 0000–FFFF; útil para detectar mensajes perdidos', k: 'countNumber' });
  return finish(res, c);
}

function findGnssStart(f, from, end) {
  for (let i = from + 6; i < end; i++) {
    if (/^\d{14}$/.test(f[i]) && isNum(f[i - 1]) && isNum(f[i - 2]) && Math.abs(parseFloat(f[i - 1])) <= 90 && Math.abs(parseFloat(f[i - 2])) <= 180
      && (f[i - 1].includes('.') || f[i - 2].includes('.'))) return i - 6;
  }
  return -1;
}

function finish(res, c) {
  res.sections = c.sections.filter(s => s.fields.length);
  res.positions = c.positions;
  res.data = c.data;
  const extra = c.sections.filter(s => s.kind === 'raw' && /EXTRA/.test(s.title)).reduce((a, s) => a + s.fields.length, 0);
  if (res.modelSwitched) res.warnings.push(`La versión de protocolo corresponde a ${res.model.name}; se decodificó con ese modelo en lugar del seleccionado.`);
  if (c.missing) res.warnings.push(`Faltan ${c.missing} campo(s) respecto a la definición del protocolo: la trama puede estar truncada o ser de otra versión de firmware.`);
  if (extra) res.warnings.push(`La trama trae ${extra} campo(s) más de los esperados: puede haber máscaras opcionales activas o una versión de firmware distinta.`);
  if (res.data.sendTime && !/^\d{14}$/.test(res.data.sendTime)) res.warnings.push('La hora de envío no tiene el formato YYYYMMDDHHMMSS.');
  for (const p of res.positions) {
    if (p.lat !== '' && p.lon !== '' && (!isNum(p.lat) || !isNum(p.lon) || Math.abs(+p.lat) > 90 || Math.abs(+p.lon) > 180)) res.warnings.push('Coordenadas fuera de rango.');
  }
  for (const s of res.sections) for (const fl of s.fields) {
    if (fl.idx !== null && fl.idx !== undefined) res.roles[fl.idx] = fl.cls.replace('val-', 'c-');
    fl.empty = fl.value === '' && !fl.missing;
  }
  return res;
}

// =====================================================================
//  RENDER
// =====================================================================
const ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
const ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

const KEEP_UPPER = /^(GNSS|LBS|CAN|ERI|FRI|RF433|1-WIRE|RAT|ID|GEO|IO|UART|AT\+GTCAN|MAG|BT|ACK|SACK|LTE|EIO100|HDOP|DFS)$/;
function sentenceCase(t) {
  const words = String(t).split(' ').map(w => {
    const core = w.replace(/[(),·]/g, '');
    return KEEP_UPPER.test(core) ? w : w.toLowerCase();
  });
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function category(res) {
  if (res.kind === 'ACK' || res.kind === 'SACK') return 'ack';
  ACTIVE = res.model || ACTIVE;
  return msgInfo(res.msg)[0];
}
function msgLabel(res) {
  if (res.kind === 'SACK' && !res.msg) return '+SACK';
  if (res.kind === 'UNKNOWN') return res.f[0];
  return `+${res.kind}:GT${res.msg}`;
}
function msgDesc(res) {
  if (res.kind === 'SACK') return res.msg === 'HBD' ? 'Acuse del servidor al heartbeat' : 'Acuse del servidor (Server Acknowledgement)';
  if (res.kind === 'ACK') return res.msg === 'HBD' ? 'Heartbeat del equipo: mantiene viva la conexión' : `El equipo confirma la recepción del comando AT+GT${res.msg}`;
  if (res.kind === 'UNKNOWN') return 'Formato no reconocido — decodificación genérica';
  ACTIVE = res.model || ACTIVE;
  return msgInfo(res.msg)[1].replace(' · ', ' — ');
}
function statusOf(res) {
  if (res.error) return 'err';
  return res.warnings.length ? 'warn' : 'ok';
}
// Solo el estado (error / OK) lleva color; el resto de valores es neutro.
function valueTone(cls) {
  if (cls === 'val-error') return 'is-err';
  if (cls === 'val-ok') return 'is-ok';
  return '';
}

function renderResult(res, i) {
  if (res.error) {
    return `<div class="notice notice-err">${ICON_ERR}<div><strong>No se pudo decodificar</strong><ul><li>${esc(res.error)}</li></ul><div class="raw">${esc(res.raw)}</div></div></div>`;
  }
  const cat = category(res);
  const typeLabel = { loc: 'Reporte de posición', alarm: 'Alarma', event: 'Evento', info: 'Información del equipo', ack: 'Acuse' }[cat] || 'Mensaje';
  const d = res.data;
  const label = msgLabel(res);
  const m = /^(\+\w+:)(.*)$/.exec(label);
  let html = `<div class="result" data-result="${i}">`;
  html += `<header class="msg-head">
      <div class="eyebrow"><span class="cat cat-${cat}"></span>${typeLabel}</div>
      <h1 class="msg-title">${m ? `<span class="pfx">${esc(m[1])}</span>${esc(m[2])}` : esc(label)}${res.kind === 'BUFF' ? '<span class="badge">Buffer</span>' : ''}</h1>
      <p class="msg-desc">${esc(msgDesc(res))}</p>
    </header>`;

  // Datos clave
  const facts = [];
  if (d.imei) facts.push(['IMEI', d.imei, d.deviceName || '']);
  if (res.pv && res.pv.ok) {
    facts.push(['Protocolo', `${res.pv.devName} ${res.pv.version}`, res.modelDetected ? `modelo detectado: ${res.model.name}` : `decodificado como ${res.model.name}`]);
  }
  if (d.sendTime) facts.push(['Enviado', fmtTime(d.sendTime) || d.sendTime, 'hora local del equipo']);
  if (d.countNumber) facts.push(['Secuencia', d.countNumber, Number.isFinite(hexv(d.countNumber)) ? `${hexv(d.countNumber)} en decimal` : '']);
  const last = res.positions[res.positions.length - 1];
  if (last && last.speed !== undefined && last.speed !== '') facts.push(['Velocidad', `${last.speed} km/h`, last.azimuth !== '' ? `rumbo ${last.azimuth}° ${cardinal(last.azimuth)}` : '']);
  if (last && last.acc !== undefined) facts.push(['Fix GNSS', last.acc === '0' ? 'Sin fix' : last.acc ? `HDOP ${last.acc}` : '—', last.acc === '0' ? 'última posición conocida' : (d.satellites ? `${d.satellites} satélites` : '')]);
  const motion = d.motionStatus || (d.deviceStatus ? (d.deviceStatus.length === 10 ? d.deviceStatus.slice(4, 6) : d.deviceStatus.slice(0, 2)) : '');
  if (motion && MOTION[motion.toUpperCase()]) { const t = MOTION[motion.toUpperCase()].split(' · '); facts.push(['Estado', t[0], t.slice(1).join(' · ') || `código ${motion}`]); }
  if (d.externalPowerVoltage) facts.push(['Alimentación', mvToV(d.externalPowerVoltage), d.backupBatteryPercent ? `respaldo ${d.backupBatteryPercent} %` : '']);
  if (d.mileage) facts.push(['Odómetro', `${d.mileage} km`, d.hourMeter ? fmtHourMeter(d.hourMeter) : '']);
  if (facts.length) {
    html += '<dl class="facts"><div class="facts-grid">' + facts.map(([l, v, s, rawSub]) =>
      `<div class="fact"><dt>${esc(l)}</dt><dd>${esc(v)}${s ? `<span class="fact-sub">${rawSub ? s : esc(s)}</span>` : ''}</dd></div>`).join('') + '</div></dl>';
  }

  if (res.warnings.length) {
    html += `<div class="notice notice-warn">${ICON_WARN}<div><strong>Revisar</strong><ul>${res.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div></div>`;
  }

  const valid = res.positions.filter(p => isNum(p.lat) && isNum(p.lon) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180 && !(+p.lat === 0 && +p.lon === 0));
  if (valid.length) html += renderMap(valid);

  html += '<div class="section-label group-label" style="margin-top:0">Trama original</div>';
  html += '<div class="raw-box" aria-label="Trama original">' + res.f.map((v, idx) =>
    `<span class="rc${v === '' ? ' empty' : ''}" data-idx="${idx}" title="Campo ${idx}">${esc(v)}</span>`).join('<span class="sep">,</span>') + '<span class="sep">$</span></div>';

  html += `<div class="tools">
      <label class="search">${ICON_SEARCH}<input type="search" placeholder="Buscar campo, valor o descripción" data-filter aria-label="Buscar campo"></label>
      <button class="btn btn-tinted" data-copy="json">Copiar JSON</button>
      <button class="btn btn-tinted" data-copy="text">Copiar tabla</button>
    </div>`;

  for (const s of res.sections) {
    html += `<details class="section" open><summary>${CHEV}<span class="section-title">${esc(sentenceCase(s.title))}</span><span class="section-count">${s.fields.length}</span></summary><div class="fields">`;
    for (const fl of s.fields) {
      let raw, tone;
      if (fl.missing) { raw = 'ausente'; tone = 'is-missing'; }
      else if (fl.value === '') { raw = '—'; tone = 'is-empty'; }
      else { raw = fl.value; tone = valueTone(fl.cls); }
      html += `<div class="field${fl.empty ? ' empty-field' : ''}"${fl.idx !== null ? ` data-idx="${fl.idx}"` : ''}>
          <span class="f-idx">${fl.idx !== null ? fl.idx : ''}</span>
          <div><div class="f-name">${esc(fl.name)}</div>${fl.desc ? `<div class="f-desc">${esc(fl.desc)}</div>` : ''}</div>
          <div class="f-val"><span class="f-raw ${tone}"${fl.value === '' && !fl.missing ? ' title="Vacío"' : ''}>${esc(raw)}</span>${fl.unit && fl.value !== '' ? ` <span class="f-unit">${esc(fl.unit)}</span>` : ''}${fl.human ? `<span class="f-human">${esc(fl.human)}</span>` : ''}</div>
        </div>`;
    }
    html += '</div></details>';
  }
  html += '</div>';
  return html;
}

function renderMap(positions) {
  const p = positions[positions.length - 1];
  const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
  const dd = 0.006;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - dd},${lat - dd},${lon + dd},${lat + dd}&layer=mapnik&marker=${lat},${lon}`;
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  return `<div class="map">
      <iframe loading="lazy" src="${embed}" title="Mapa de la posición"></iframe>
      <div class="map-row">
        <div class="map-coords"><div class="c">${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
          <div class="s">${p.acc === '0' ? 'Última posición conocida' : 'Posición GNSS'}${p.utc ? ' · ' + esc(fmtTime(p.utc)) + ' UTC' : ''}${positions.length > 1 ? ` · última de ${positions.length}` : ''}</div>
        </div>
        <div class="map-links">
          <button data-copy-coords="${lat.toFixed(6)},${lon.toFixed(6)}">Copiar</button>
          <a href="${gmaps}" target="_blank" rel="noopener">Google Maps</a>
          <a href="${osm}" target="_blank" rel="noopener">OpenStreetMap</a>
        </div>
      </div>
    </div>`;
}

function resultToJson(res) {
  return {
    mensaje: msgLabel(res),
    descripcion: msgDesc(res),
    protocolo: res.pv && res.pv.ok ? { dispositivo: res.pv.devName, version: res.pv.version } : undefined,
    datos: res.data,
    posiciones: res.positions,
    advertencias: res.warnings,
    campos: res.sections.map(s => ({ seccion: s.title, campos: s.fields.map(f => ({ indice: f.idx, nombre: f.name, valor: f.value, unidad: f.unit || undefined, interpretado: f.human || undefined, descripcion: f.desc || undefined })) })),
    trama: res.raw + '$',
  };
}
function resultToText(res) {
  const lines = [`${msgLabel(res)} · ${msgDesc(res)}`];
  for (const s of res.sections) {
    lines.push('', s.title);
    for (const f of s.fields) lines.push(`[${f.idx ?? '-'}]\t${f.name}\t${f.value}${f.unit && f.value ? ' ' + f.unit : ''}\t${f.human || f.desc || ''}`);
  }
  return lines.join('\n');
}

// =====================================================================
//  UI
// =====================================================================
const state = { results: [], active: 0, model: null };
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento no disponible */ } },
};

function emptyState() {
  return `<div class="empty-view">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>
      <h2>Sin trama</h2>
      <p>Pega una trama del ${esc(state.model ? state.model.name : 'equipo')} o elige un ejemplo para ver cada campo decodificado. El modelo se detecta automáticamente por la versión de protocolo.</p>
    </div>`;
}

function decodeAll(saveHistory = true) {
  const raw = $('frameInput').value;
  const frames = splitFrames(raw);
  const out = $('outputPanel');
  if (!frames.length) { state.results = []; out.innerHTML = emptyState(); return; }
  const opts = { forceWest: $('optForceWest').checked, model: state.model };
  state.results = frames.map(fr => {
    try { return decodeOne(fr, opts); }
    catch (e) { console.error(e); return { raw: fr, f: fr.split(','), error: 'Error interno al decodificar: ' + e.message, warnings: [], sections: [], positions: [], data: {} }; }
  });
  state.active = 0;
  renderOutput();
  if (saveHistory) addHistory(raw.trim(), state.results[0]);
}

function renderOutput() {
  const out = $('outputPanel');
  let html = '';
  if (state.results.length > 1) {
    html += '<div class="segmented" role="tablist">' + state.results.map((r, i) => {
      const st = statusOf(r);
      const t = r.data && r.data.sendTime ? fmtTime(r.data.sendTime).slice(11) : '';
      return `<button role="tab" aria-selected="${i === state.active}" data-tab="${i}"><span class="dot ${st}"></span>#${i + 1} ${esc(r.error ? 'error' : (r.kind === 'UNKNOWN' ? '?' : (r.msg ? 'GT' + r.msg : r.kind)))}${t ? ' · ' + t : ''}</button>`;
    }).join('') + '</div>';
  }
  html += renderResult(state.results[state.active], state.active);
  out.innerHTML = `<div class="content-inner">${html}</div>`;
  out.classList.toggle('hide-empty', $('optHideEmpty').checked);
  out.scrollTop = 0;
}

function addHistory(raw, res) {
  if (!raw) return;
  let h = store.get('qd-history', []);
  h = h.filter(x => x.raw !== raw);
  const label = !res || res.error ? 'error' : res.kind === 'UNKNOWN' ? '?' : (res.msg ? `${res.kind === 'BUFF' ? 'BUFF ' : res.kind === 'ACK' ? 'ACK ' : res.kind === 'SACK' ? 'SACK ' : ''}GT${res.msg}` : res.kind);
  h.unshift({ raw, label: (res && res.model ? res.model.name + ' · ' : '') + label + (splitFrames(raw).length > 1 ? ` +${splitFrames(raw).length - 1}` : '') });
  store.set('qd-history', h.slice(0, 12));
  renderHistory();
}
function renderHistory() {
  const h = store.get('qd-history', []);
  $('history').innerHTML = h.length
    ? h.map((x, i) => `<button class="list-row" data-hist="${i}"><span class="history-label">${esc(x.label)}</span><span class="history-raw">${esc(x.raw)}</span></button>`).join('')
    : '<div class="list-empty">Las tramas que decodifiques aparecerán aquí.</div>';
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1600);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* sin portapapeles */ }
    ta.remove();
  }
  toast('Copiado al portapapeles');
}

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode) root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
  const dark = mode ? mode === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('themeToggle').innerHTML = dark
    ? '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

function setModel(m, redecode) {
  state.model = m;
  store.set('qd-model', m.id);
  if (location.hash.replace(/^#\/?/, '').toLowerCase() !== m.id) history.replaceState(null, '', '#' + m.id);
  document.title = `${m.name} Decoder · Queclink @Track`;
  $('modelPicker').innerHTML = MODELS.map(x => `<button role="tab" data-model="${x.id}" aria-selected="${x === m}">${esc(x.name)}</button>`).join('');
  $('appMeta').textContent = `@Track Air Interface Protocol ${m.protocol}`;
  $('modelNote').innerHTML = m.note || '';
  $('examples').innerHTML = m.examples.map(([group, items], gi) =>
    `<div class="ex-group"><div class="ex-title">${esc(group)}</div><div class="ex-grid">${items.map(([label], ii) =>
      `<button class="ex-chip" data-ex="${gi}:${ii}">${esc(label)}</button>`).join('')}</div></div>`).join('');
  if (redecode && $('frameInput').value.trim()) decodeAll(false);
  else if (!state.results.length) $('outputPanel').innerHTML = emptyState();
}

function init() {
  // Modelos (#gv58cg en la URL selecciona el modelo)
  const fromHash = modelById(location.hash.replace(/^#\/?/, '').toLowerCase());
  setModel(fromHash || modelById(store.get('qd-model', '')) || MODELS[0], false);
  $('modelPicker').addEventListener('click', e => {
    const b = e.target.closest('[data-model]');
    if (b) setModel(modelById(b.dataset.model), true);
  });
  window.addEventListener('hashchange', () => {
    const m = modelById(location.hash.replace(/^#\/?/, '').toLowerCase());
    if (m && m !== state.model) setModel(m, true);
  });

  // Ejemplos
  $('examples').addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const [gi, ii] = b.dataset.ex.split(':').map(Number);
    $('frameInput').value = state.model.examples[gi][1][ii][1];
    decodeAll(false);
  });

  // Tema
  let theme = store.get('qd-theme', null);
  applyTheme(theme);
  $('themeToggle').addEventListener('click', () => {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    theme = dark ? 'light' : 'dark';
    store.set('qd-theme', theme);
    applyTheme(theme);
  });

  // Opciones
  $('optHideEmpty').checked = store.get('qd-hide-empty', false);
  $('optForceWest').checked = store.get('qd-force-west', false);
  $('optHideEmpty').addEventListener('change', e => { store.set('qd-hide-empty', e.target.checked); $('outputPanel').classList.toggle('hide-empty', e.target.checked); });
  $('optForceWest').addEventListener('change', e => { store.set('qd-force-west', e.target.checked); if (state.results.length) decodeAll(false); });

  // Acciones
  $('btnDecode').addEventListener('click', () => decodeAll());
  $('btnClear').addEventListener('click', () => { $('frameInput').value = ''; state.results = []; $('outputPanel').innerHTML = emptyState(); $('frameInput').focus(); });
  $('frameInput').addEventListener('paste', () => setTimeout(() => decodeAll(), 0));
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); decodeAll(); } });

  // Historial
  renderHistory();
  $('history').addEventListener('click', e => {
    const b = e.target.closest('[data-hist]');
    if (!b) return;
    const h = store.get('qd-history', []);
    const item = h[+b.dataset.hist];
    if (item) { $('frameInput').value = item.raw; decodeAll(false); }
  });
  $('btnClearHistory').addEventListener('click', () => { store.set('qd-history', []); renderHistory(); });

  // Interacciones del panel de salida
  const out = $('outputPanel');
  out.innerHTML = emptyState();
  out.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { state.active = +tab.dataset.tab; renderOutput(); return; }
    const chip = e.target.closest('.rc[data-idx]');
    if (chip) {
      const row = out.querySelector(`.field[data-idx="${chip.dataset.idx}"]`);
      if (row) {
        const det = row.closest('details'); if (det) det.open = true;
        row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const res = state.results[state.active];
      copyText(cp.dataset.copy === 'json' ? JSON.stringify(resultToJson(res), null, 2) : resultToText(res));
      return;
    }
    const cc = e.target.closest('[data-copy-coords]');
    if (cc) copyText(cc.dataset.copyCoords);
  });
  out.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-idx]');
    out.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
    if (t) out.querySelectorAll(`[data-idx="${t.dataset.idx}"]`).forEach(x => x.classList.add('hl'));
  });
  out.addEventListener('mouseleave', () => out.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')));
  out.addEventListener('input', e => {
    if (!e.target.matches('[data-filter]')) return;
    const q = e.target.value.trim().toLowerCase();
    out.querySelectorAll('.field').forEach(r => r.classList.toggle('filtered', !!q && !r.textContent.toLowerCase().includes(q)));
    out.querySelectorAll('details.section').forEach(d => { if (q) d.open = true; });
  });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined') module.exports = { decodeOne, splitFrames, registerModel, MODELS };
