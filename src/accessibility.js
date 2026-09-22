const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',');

export function isTextEntryTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || '').toUpperCase();
  return ['INPUT','TEXTAREA','SELECT'].includes(tag) || Boolean(target.isContentEditable) || target.getAttribute?.('role') === 'textbox';
}

export function isInteractiveTarget(target) {
  if (!target) return false;
  if (isTextEntryTarget(target)) return true;
  const tag = String(target.tagName || '').toUpperCase();
  return ['BUTTON','A','SUMMARY'].includes(tag) || Boolean(target.closest?.('button,a[href],[role="button"],[role="link"]'));
}

export function focusableElements(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false;
    return true;
  });
}

export class FocusTrap {
  constructor() {
    this.container = null;
    this.previous = null;
    this.background = null;
    this.onEscape = null;
    this.bound = (event) => this.handleKey(event);
  }

  activate(container, { background, onEscape, initialFocus } = {}) {
    this.deactivate({ restore: false });
    if (!container) return;
    this.container = container;
    this.previous = globalThis.document?.activeElement || null;
    this.background = background || null;
    this.onEscape = onEscape || null;
    if (this.background && 'inert' in this.background) this.background.inert = true;
    container.addEventListener('keydown', this.bound);
    queueMicrotask(() => {
      const target = initialFocus || focusableElements(container)[0] || container;
      if (!target.hasAttribute?.('tabindex') && target === container) target.setAttribute?.('tabindex', '-1');
      target.focus?.({ preventScroll: true });
    });
  }

  handleKey(event) {
    if (!this.container) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableElements(this.container);
    if (!items.length) { event.preventDefault(); this.container.focus?.(); return; }
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && globalThis.document?.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && globalThis.document?.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  deactivate({ restore = true } = {}) {
    if (this.container) this.container.removeEventListener('keydown', this.bound);
    if (this.background && 'inert' in this.background) this.background.inert = false;
    const previous = this.previous;
    this.container = null; this.background = null; this.onEscape = null; this.previous = null;
    if (restore && previous?.isConnected) queueMicrotask(() => previous.focus?.({ preventScroll: true }));
  }
}

export class Announcer {
  constructor(polite, assertive) { this.polite = polite; this.assertive = assertive; this.last = ''; }
  announce(message, { priority = 'polite', dedupe = true } = {}) {
    const text = String(message || '').trim();
    if (!text || (dedupe && text === this.last)) return;
    this.last = text;
    const el = priority === 'assertive' ? this.assertive : this.polite;
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = text; }, 20);
  }
}

export function focusMainHeading(root) {
  if (!root?.querySelector) return;
  const heading = root.querySelector('h1, [role="heading"]');
  const target = heading || root;
  if (!target.hasAttribute?.('tabindex')) target.setAttribute?.('tabindex', '-1');
  requestAnimationFrame?.(() => target.focus?.({ preventScroll: true }));
}

export function timerEventAnnouncement(event, { phaseLabel = (v) => v, translateLabel = (v) => v, durationText = () => '', t = (key) => key } = {}) {
  if (!event) return '';
  if (event.type === 'session-paused') return t('a11y.paused');
  if (event.type === 'session-resumed') return t('a11y.resumed');
  if (event.type === 'session-completed') return t('a11y.completed');
  if (event.type === 'manual-completed') return t('a11y.manualCompleted');
  if (event.type !== 'step-started') return '';
  const step = event.step || {};
  const phase = phaseLabel(step.phase || 'custom');
  const label = translateLabel(step.label || phase);
  const total = step.manual ? step.timeCapMs : step.durationMs;
  const duration = total ? ` ${durationText(total)}` : '';
  let result = t('a11y.stepStarted', { phase, label, duration });
  if (step.round?.current && step.round?.total) result += ` ${t('a11y.round', step.round)}.`;
  return result.trim();
}
