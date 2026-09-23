const PRODUCTION_LOCALES = new Set(['en', 'de']);
const TEST_LOCALES = new Set(['en-XA', 'ar-XB']);

export const LOCALE_OPTIONS = [
  { id: 'system', label: 'System language' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'en-XA', label: 'Pseudo — expanded' },
  { id: 'ar-XB', label: 'Pseudo — RTL' }
];

const DE = {
  'Skip to main content': 'Zum Hauptinhalt springen',
  'Timer home': 'Timer-Startseite',
  'Install app': 'App installieren',
  'Install Timer': 'Timer installieren',
  'Create timer': 'Timer erstellen',
  'Primary navigation': 'Hauptnavigation',
  'Library': 'Bibliothek',
  'History': 'Verlauf',
  'Settings': 'Einstellungen',
  'Start': 'Start',
  'Pause': 'Pause',
  'Resume': 'Fortsetzen',
  'Next': 'Weiter',
  'Previous': 'Zurück',
  'Finish': 'Beenden',
  'Done': 'Fertig',
  'Save': 'Speichern',
  'Cancel': 'Abbrechen',
  'Close': 'Schließen',
  'Back': 'Zurück',
  'Delete': 'Löschen',
  'Repeat': 'Wiederholen',
  'Search': 'Suchen',
  'Work': 'Arbeit',
  'Rest': 'Pause',
  'Prepare': 'Vorbereiten',
  'Preparation': 'Vorbereitung',
  'Recovery': 'Erholung',
  'Cooldown': 'Abkühlen',
  'Paused': 'Pausiert',
  'Complete': 'Fertig',
  'Timer': 'Timer',
  'Stopwatch': 'Stoppuhr',
  'Time': 'Zeit',
  'Interval': 'Intervall',
  'Circuit': 'Zirkel',
  'Boxing': 'Boxen',
  'Run / Walk': 'Laufen / Gehen',
  'Ladder': 'Leiter',
  'Pyramid': 'Pyramide',
  'Custom Routine': 'Benutzerdefinierte Routine',
  'Dark': 'Dunkel',
  'Light': 'Hell',
  'Interval progress': 'Intervallfortschritt',
  'Quick Timer': 'Schnelltimer',
  'Quick Start': 'Schnellstart',
  'More Timers': 'Weitere Timer',
  'Recent': 'Zuletzt',
  'Favorites': 'Favoriten',
  'My Routines': 'Meine Routinen',
  'Create': 'Erstellen',
  'No saved routines yet.': 'Noch keine gespeicherten Routinen.',
  'Completed timers will appear here.': 'Abgeschlossene Timer erscheinen hier.',
  'No completed sessions yet.': 'Noch keine abgeschlossenen Einheiten.',
  'No matching routines.': 'Keine passenden Routinen.',
  'No matching sessions.': 'Keine passenden Einheiten.',
  'Start fast. Configure only when you need it.': 'Schnell starten. Nur bei Bedarf konfigurieren.',
  'Saved timers and routines.': 'Gespeicherte Timer und Routinen.',
  'Your recorded timer sessions.': 'Deine aufgezeichneten Timer-Einheiten.',
  'Display, cues, data and device behavior.': 'Anzeige, Signale, Daten und Geräteverhalten.',
  'Appearance': 'Darstellung',
  'Accessibility & Language': 'Barrierefreiheit & Sprache',
  'Theme': 'Design',
  'Default live layout': 'Standard-Live-Layout',
  'Language': 'Sprache',
  'Text size': 'Textgröße',
  'Normal': 'Normal',
  'Large': 'Groß',
  'Extra large': 'Sehr groß',
  'High contrast': 'Hoher Kontrast',
  'Large controls': 'Große Bedienelemente',
  'Reduce motion': 'Bewegung reduzieren',
  'System': 'System',
  'On': 'Ein',
  'Off': 'Aus',
  'Screen reader optimization': 'Screenreader-Optimierung',
  'Time format': 'Zeitformat',
  '12-hour': '12-Stunden',
  '24-hour': '24-Stunden',
  'Number digits': 'Zifferndarstellung',
  'System digits': 'Systemziffern',
  'Latin digits': 'Lateinische Ziffern',
  'Timer': 'Timer',
  'Time adjustment': 'Zeitanpassung',
  'Keep screen awake': 'Bildschirm wach halten',
  'Wall layout auto-hide': 'Bedienelemente im Wall-Layout ausblenden',
  'Cues': 'Signale',
  'Sound': 'Ton',
  'Voice announcements': 'Sprachansagen',
  'Haptics': 'Haptik',
  'Notifications': 'Benachrichtigungen',
  'Completion notifications': 'Benachrichtigung bei Abschluss',
  'Data & Backup': 'Daten & Sicherung',
  'Device & PWA': 'Gerät & PWA',
  'App': 'App',
  'Install PWA': 'PWA installieren',
  'Export full backup': 'Vollständige Sicherung exportieren',
  'Import backup': 'Sicherung importieren',
  'Clear history': 'Verlauf löschen',
  'Create local recovery snapshot': 'Lokalen Wiederherstellungspunkt erstellen',
  'Quarantine': 'Quarantäne',
  'Recent recovery snapshots': 'Letzte Wiederherstellungspunkte',
  'Never': 'Nie',
  'Supported': 'Unterstützt',
  'Unavailable': 'Nicht verfügbar',
  'Native only': 'Nur nativ',
  'Optional': 'Optional',
  'Update now': 'Jetzt aktualisieren',
  'Update after timer': 'Nach dem Timer aktualisieren',
  'Timer update ready.': 'Timer-Update verfügbar.',
  'Timer complete': 'Timer abgeschlossen',
  'Tap to return': 'Tippen, um zurückzukehren',
  'System language': 'Systemsprache',
  'System default': 'Systemstandard',
  'Update queued for after the active timer.': 'Update für nach dem aktiven Timer vorgemerkt.',
  'Update ready. It will not interrupt the active timer.': 'Update verfügbar. Der aktive Timer wird nicht unterbrochen.',
  'Workout': 'Training',
  'Restart current step': 'Aktuellen Schritt neu starten',
  'Previous step': 'Vorheriger Schritt',
  'Lock controls': 'Bedienelemente sperren',
  'Toggle fullscreen': 'Vollbild umschalten',
  'Open Wall display window': 'Wall-Anzeige in neuem Fenster öffnen',
  'Mute cues': 'Signale stummschalten',
  'Unmute cues': 'Signale einschalten',
  'End workout': 'Training beenden',
  'Live Layout': 'Live-Layout',
  'Focus': 'Fokus',
  'Classic': 'Klassisch',
  'Strength': 'Kraft',
  'Wall': 'Wall',
  'Keyboard shortcuts': 'Tastenkürzel',
  'Pause / Resume': 'Pause / Fortsetzen',
  'Next interval': 'Nächstes Intervall',
  'Previous interval': 'Vorheriges Intervall',
  'Restart step': 'Schritt neu starten',
  'Mute / Unmute': 'Stumm / Ton an',
  'Lock / Unlock': 'Sperren / Entsperren',
  'Fullscreen': 'Vollbild',
  'More workout actions': 'Weitere Trainingsaktionen',
  'Set quick timer duration': 'Schnelltimer-Dauer einstellen',
  'Create Timer': 'Timer erstellen',
  'Browse all': 'Alle anzeigen',
  'Toggle cues': 'Signale umschalten',
  'Unlock controls': 'Bedienelemente entsperren',
  'Resting until next block': 'Pause bis zum nächsten Block',
  'Lap': 'Runde',
  'Round': 'Runde',
  'Work / rest repetitions': 'Arbeits-/Pausen-Wiederholungen',
  'Classic 20 / 10 intervals': 'Klassische 20/10-Intervalle',
  'Timed and manual exercise sequence': 'Zeitgesteuerte und manuelle Übungsfolge',
  'Every minute / custom block timing': 'Jede Minute / benutzerdefinierte Blockzeit',
  'As many rounds as possible': 'So viele Runden wie möglich',
  'Race a workout against the clock': 'Training gegen die Uhr',
  'Rounds with fixed recovery': 'Runden mit fester Erholung',
  'Alternating running and recovery': 'Abwechselnd Laufen und Erholung',
  'Progressively changing work intervals': 'Progressiv veränderte Arbeitsintervalle',
  'Ramp up and back down': 'Ansteigen und wieder abfallen',
  'Nested sections, repeats, timed and manual steps': 'Verschachtelte Abschnitte, Wiederholungen sowie zeitgesteuerte und manuelle Schritte',
  'Open-ended timer with laps': 'Offener Timer mit Runden',
  'Session Review': 'Einheitenübersicht',
  'Comparable attempts': 'Vergleichbare Versuche',
  'Observed phase time': 'Beobachtete Phasenzeit',
  'Actual / planned': 'Ist / geplant',
  'Active time': 'Aktive Zeit',
  'Wall time': 'Gesamtzeit',
  'Timed': 'Zeit erfasst',
  'Observed work': 'Beobachtete Arbeit',
  'This week': 'Diese Woche',
  'This month': 'Dieser Monat',
  'Sessions': 'Einheiten',
  'List': 'Liste',
  'Calendar': 'Kalender',
  'Stats': 'Statistik',
  'All modes': 'Alle Modi',
  'Export CSV': 'CSV exportieren',
  'Export JSON': 'JSON exportieren',
  'Notes': 'Notizen',
  'Save note': 'Notiz speichern',
  'Repeat timer': 'Timer wiederholen',
  'One timer or many. Start in seconds.': 'Ein Timer oder mehrere. In Sekunden starten.',
  'Active Timers': 'Aktive Timer',
  'All timers keep running independently.': 'Alle Timer laufen unabhängig weiter.',
  'Try 90s, 1:30, 3m, or 1h 20m.': 'Zum Beispiel 90s, 1:30, 3m oder 1h 20m.',
  'Customize': 'Anpassen',
  'Pinned': 'Angepinnt',
  'Recent': 'Zuletzt',
  'Clear': 'Leeren',
  'Repeat Last': 'Letzten wiederholen',
  'Open-ended timing with laps': 'Offene Zeitmessung mit Runden',
  'Alternating timed phases': 'Abwechselnde Zeitphasen',
  'Sequences, specialized timers and advanced builders': 'Sequenzen, Spezialtimer und erweiterte Builder',
  'Customize Quick Timer': 'Schnelltimer anpassen',
  'Pinned durations': 'Angepinnte Dauern',
  'These start immediately with one tap from Home. Use the same formats as Quick Timer.': 'Diese starten auf der Startseite mit einem Tippen. Verwende dieselben Formate wie beim Schnelltimer.',
  'Adjustment buttons': 'Anpassungsschaltflächen',
  'Shown on Quick Timer and adjustable active countdowns.': 'Werden beim Schnelltimer und bei anpassbaren aktiven Countdowns angezeigt.',
  'Reset defaults': 'Standard zurücksetzen',
  'Live timer adjustment': 'Live-Timer-Anpassung'
};

const SOURCE_TRANSLATIONS = { de: DE };
const REVERSE = {};
for (const [locale, dict] of Object.entries(SOURCE_TRANSLATIONS)) {
  REVERSE[locale] = new Map(Object.entries(dict).map(([source, translated]) => [translated, source]));
}

const KEYED = {
  en: {
    'a11y.stepStarted': '{phase} started. {label}.{duration}',
    'a11y.paused': 'Timer paused.',
    'a11y.resumed': 'Timer resumed.',
    'a11y.completed': 'Workout complete.',
    'a11y.manualCompleted': 'Work complete. Resting until the next block.',
    'a11y.round': 'Round {current} of {total}',
    'a11y.remaining': '{duration} remaining',
    'units.second.one': '{count} second',
    'units.second.other': '{count} seconds',
    'units.minute.one': '{count} minute',
    'units.minute.other': '{count} minutes',
    'units.hour.one': '{count} hour',
    'units.hour.other': '{count} hours'
  },
  de: {
    'a11y.stepStarted': '{phase} gestartet. {label}.{duration}',
    'a11y.paused': 'Timer pausiert.',
    'a11y.resumed': 'Timer fortgesetzt.',
    'a11y.completed': 'Training abgeschlossen.',
    'a11y.manualCompleted': 'Arbeit abgeschlossen. Pause bis zum nächsten Block.',
    'a11y.round': 'Runde {current} von {total}',
    'a11y.remaining': '{duration} verbleibend',
    'units.second.one': '{count} Sekunde',
    'units.second.other': '{count} Sekunden',
    'units.minute.one': '{count} Minute',
    'units.minute.other': '{count} Minuten',
    'units.hour.one': '{count} Stunde',
    'units.hour.other': '{count} Stunden'
  }
};

const ACCENT_MAP = {
  a: 'å', A: 'Å', e: 'ë', E: 'Ë', i: 'ï', I: 'Ï', o: 'ø', O: 'Ø', u: 'ü', U: 'Ü',
  c: 'ç', C: 'Ç', n: 'ñ', N: 'Ñ', y: 'ÿ', Y: 'Ÿ'
};

function pseudoExpand(value) {
  const text = String(value ?? '');
  const accented = [...text].map((ch) => ACCENT_MAP[ch] || ch).join('');
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return `［${accented}${'~'.repeat(Math.max(2, Math.ceil(letters * 0.35)))}］`;
}

function pseudoRtl(value) {
  return `⁧⟦${String(value ?? '')}⟧⁩`;
}

function normalizeLocale(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'en';
  if (TEST_LOCALES.has(raw)) return raw;
  const canonical = raw.replace('_', '-');
  if (PRODUCTION_LOCALES.has(canonical)) return canonical;
  const base = canonical.split('-')[0].toLowerCase();
  return PRODUCTION_LOCALES.has(base) ? base : 'en';
}

export function resolveLocale(preference = 'system', languages) {
  if (preference && preference !== 'system') return normalizeLocale(preference);
  const candidates = Array.isArray(languages) && languages.length ? languages : (globalThis.navigator?.languages || [globalThis.navigator?.language || 'en']);
  for (const candidate of candidates) {
    const resolved = normalizeLocale(candidate);
    if (resolved !== 'en' || String(candidate || '').toLowerCase().startsWith('en')) return resolved;
  }
  return 'en';
}

export function localeDirection(locale) {
  return normalizeLocale(locale) === 'ar-XB' ? 'rtl' : 'ltr';
}

export function sourceLanguage(locale) {
  return normalizeLocale(locale);
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => vars[key] == null ? '' : String(vars[key]));
}

export function t(key, locale = 'en', vars = {}) {
  const resolved = normalizeLocale(locale);
  const base = resolved === 'de' ? 'de' : 'en';
  let template = KEYED[base]?.[key] || KEYED.en[key] || key;
  template = interpolate(template, vars);
  if (resolved === 'en-XA') return pseudoExpand(template);
  if (resolved === 'ar-XB') return pseudoRtl(template);
  return template;
}

export function translateSource(value, locale = 'en') {
  if (value == null) return value;
  const original = String(value);
  const match = original.match(/^(\s*)(.*?)(\s*)$/s);
  const leading = match?.[1] || '';
  const body = match?.[2] || original;
  const trailing = match?.[3] || '';
  if (!body) return original;
  const resolved = normalizeLocale(locale);
  if (resolved === 'en') {
    for (const reverse of Object.values(REVERSE)) {
      if (reverse.has(body)) return `${leading}${reverse.get(body)}${trailing}`;
    }
    return original;
  }
  let canonical = body;
  for (const reverse of Object.values(REVERSE)) if (reverse.has(canonical)) canonical = reverse.get(canonical);
  if (resolved === 'en-XA') return `${leading}${pseudoExpand(canonical)}${trailing}`;
  if (resolved === 'ar-XB') return `${leading}${pseudoRtl(canonical)}${trailing}`;
  return `${leading}${SOURCE_TRANSLATIONS[resolved]?.[canonical] || canonical}${trailing}`;
}

export function phaseLabel(phase, locale = 'en') {
  const source = ({ work: 'Work', rest: 'Rest', prepare: 'Prepare', recovery: 'Recovery', cooldown: 'Cooldown', custom: 'Custom' })[phase] || String(phase || '');
  return translateSource(source, locale);
}

export function translateBuiltInLabel(label, locale = 'en') {
  const known = new Set(['Work','Rest','Get Ready','Prepare','Preparation','Recovery','Cooldown','Box','Run','Walk','Timer','Stopwatch','Time','Paused','Complete']);
  if (!known.has(String(label || ''))) return String(label || '');
  const source = label === 'Get Ready' ? 'Prepare' : String(label);
  return translateSource(source, locale);
}

function intlLocale(locale, numberingSystem = 'system') {
  const resolved = normalizeLocale(locale);
  const base = resolved === 'en-XA' || resolved === 'ar-XB' ? 'en' : resolved;
  if (numberingSystem === 'latn') return `${base}-u-nu-latn`;
  return base;
}

export function formatNumber(value, locale = 'en', options = {}, numberingSystem = 'system') {
  try { return new Intl.NumberFormat(intlLocale(locale, numberingSystem), options).format(value); }
  catch { return String(value); }
}

export function formatDate(value, locale = 'en', options = {}, timeFormat = 'system', numberingSystem = 'system') {
  const opts = { ...options };
  if (timeFormat === '12') opts.hour12 = true;
  if (timeFormat === '24') opts.hour12 = false;
  try { return new Intl.DateTimeFormat(intlLocale(locale, numberingSystem), opts).format(new Date(value)); }
  catch { return new Date(value).toLocaleString(); }
}

function unitText(count, unit, locale) {
  const key = `units.${unit}.${count === 1 ? 'one' : 'other'}`;
  return t(key, locale, { count: formatNumber(count, locale) });
}

export function formatDuration(ms, locale = 'en', { style = 'short', numberingSystem = 'system' } = {}) {
  ms = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const resolved = normalizeLocale(locale);
  if (style === 'long') {
    const parts = [];
    if (hours) parts.push(unitText(hours, 'hour', resolved));
    if (minutes) parts.push(unitText(minutes, 'minute', resolved));
    if (seconds || !parts.length) parts.push(unitText(seconds, 'second', resolved));
    return parts.join(', ');
  }
  try {
    if (typeof Intl.DurationFormat === 'function') {
      const formatter = new Intl.DurationFormat(intlLocale(resolved, numberingSystem), { style: 'short' });
      return formatter.format({ hours, minutes, seconds });
    }
  } catch {}
  if (resolved === 'de') {
    if (hours) return `${formatNumber(hours,resolved)} Std. ${formatNumber(minutes,resolved)} Min.`;
    if (minutes) return seconds ? `${formatNumber(minutes,resolved)} Min. ${formatNumber(seconds,resolved)} Sek.` : `${formatNumber(minutes,resolved)} Min.`;
    return `${formatNumber(seconds,resolved)} Sek.`;
  }
  if (hours) return `${formatNumber(hours,resolved)}h ${formatNumber(minutes,resolved)}m`;
  if (minutes) return seconds ? `${formatNumber(minutes,resolved)}m ${formatNumber(seconds,resolved)}s` : `${formatNumber(minutes,resolved)}m`;
  return `${formatNumber(seconds,resolved)}s`;
}

export function applyDocumentLocale(locale = 'en') {
  if (typeof document === 'undefined') return;
  const resolved = normalizeLocale(locale);
  document.documentElement.lang = resolved === 'en-XA' || resolved === 'ar-XB' ? 'en' : resolved;
  document.documentElement.dir = localeDirection(resolved);
  document.documentElement.dataset.locale = resolved;
}

function shouldSkipNode(node) {
  const parent = node?.parentElement;
  return !parent || parent.closest('[data-no-i18n], script, style, code, pre');
}

export function localizeDOM(root, locale = 'en') {
  if (!root || typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (shouldSkipNode(node)) continue;
    const translated = translateSource(node.nodeValue, locale);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }
  for (const el of root.querySelectorAll?.('[aria-label],[title],[placeholder],[data-i18n]') || []) {
    if (el.closest('[data-no-i18n]')) continue;
    if (el.dataset.i18n) {
      const value = translateSource(el.dataset.i18n, locale);
      if (el.childElementCount === 0 && el.textContent !== value) el.textContent = value;
    }
    for (const attr of ['aria-label','title','placeholder']) {
      if (el.hasAttribute(attr)) el.setAttribute(attr, translateSource(el.getAttribute(attr), locale));
    }
  }
}

export function pseudoLocalize(value, mode = 'expanded') {
  return mode === 'rtl' ? pseudoRtl(value) : pseudoExpand(value);
}
