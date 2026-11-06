/** La bulle ancrée sous le champ : DOM fantôme isolé, repositionnée à chaque image tant qu'elle est visible. */
import type { Strength } from '@mdpgen/core';
import { strengthLabel, t } from '../shared/i18n.js';
import { isVisible } from './detect.js';
import { BUBBLE_CSS } from './styles.js';
import { ICON_EYE, ICON_EYE_OFF, ICON_FINGERPRINT, ICON_KEY, ICON_REFRESH, icon, mask } from '../shared/icons.js';

export interface BubbleState {
  password: string;
  bits: number;
  strength: Strength;
  autofilled: boolean;
  touchId: boolean;
  busy: boolean;
  error: string | null;
}

export interface BubbleHandlers {
  onUse(): void;
  onRegenerate(): void;
  onTouchId(): void;
  onDismiss(): void;
  onOptions(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class Bubble {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly card: HTMLDivElement;
  private readonly value: HTMLElement;
  private readonly eye: HTMLButtonElement;
  private readonly regen: HTMLButtonElement;
  private readonly bits: HTMLElement;
  private readonly strength: HTMLElement;
  private readonly use: HTMLButtonElement;
  private readonly touch: HTMLButtonElement;
  private readonly touchLabel: HTMLElement;
  private readonly error: HTMLElement;
  private anchor: HTMLInputElement | null = null;
  private state: BubbleState | null = null;
  private revealed = false;
  private frame = 0;
  visible = false;

  constructor(private readonly handlers: BubbleHandlers) {
    this.host = document.createElement('mdpgen-bubble');
    this.host.hidden = true;
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = BUBBLE_CSS;

    this.card = el('div', 'card');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', t('extName'));

    const head = el('div', 'head');
    const brand = el('span', 'brand');
    brand.append(icon(ICON_KEY), document.createTextNode('MDP Gen'));
    head.append(brand, el('span', 'title', t('bubbleTitle')));

    const pw = el('div', 'pw');
    this.value = el('code', 'value masked');
    this.eye = el('button', 'icon eye');
    this.eye.type = 'button';
    this.eye.dataset.action = 'reveal';
    this.regen = el('button', 'icon regen');
    this.regen.type = 'button';
    this.regen.dataset.action = 'regenerate';
    this.regen.setAttribute('aria-label', t('bubbleAnother'));
    this.regen.title = t('bubbleAnother');
    this.regen.append(icon(ICON_REFRESH));
    pw.append(this.value, this.eye, this.regen);

    const meta = el('div', 'meta');
    this.bits = el('span', 'bits');
    this.strength = el('span', 'strength');
    meta.append(this.bits, document.createTextNode(' · '), this.strength);

    const actions = el('div', 'actions');
    this.use = el('button', 'btn primary use');
    this.use.type = 'button';
    this.use.dataset.action = 'use';
    this.touch = el('button', 'btn touch');
    this.touch.type = 'button';
    this.touch.dataset.action = 'touchid';
    this.touchLabel = el('span');
    this.touch.append(icon(ICON_FINGERPRINT), this.touchLabel);
    actions.append(this.use, this.touch);

    this.error = el('div', 'error');
    this.error.hidden = true;

    const foot = el('div', 'foot');
    const dismiss = el('button', 'link dismiss', t('bubbleDismiss'));
    dismiss.type = 'button';
    dismiss.dataset.action = 'dismiss';
    const options = el('button', 'link options', t('bubbleOptions'));
    options.type = 'button';
    options.dataset.action = 'options';
    foot.append(dismiss, document.createTextNode('·'), options);

    this.card.append(head, pw, meta, actions, this.error, foot);
    this.root.append(style, this.card);

    // Le clic dans la bulle ne doit pas retirer le focus du champ.
    this.card.addEventListener('mousedown', (event) => event.preventDefault());
    this.card.addEventListener('click', (event) => this.onClick(event));
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    event.preventDefault();
    event.stopPropagation();
    switch (target.dataset.action) {
      case 'reveal':
        this.revealed = !this.revealed;
        this.renderPassword();
        break;
      case 'regenerate':
        this.handlers.onRegenerate();
        break;
      case 'use':
        this.handlers.onUse();
        break;
      case 'touchid':
        this.handlers.onTouchId();
        break;
      case 'dismiss':
        this.handlers.onDismiss();
        break;
      case 'options':
        this.handlers.onOptions();
        break;
      default:
        break;
    }
  }

  contains(node: Node | null): boolean {
    return node !== null && (node === this.host || this.host.contains(node) || this.root.contains(node));
  }

  show(anchor: HTMLInputElement, state: BubbleState): void {
    this.anchor = anchor;
    this.state = state;
    this.revealed = false;
    this.render();
    if (!this.host.isConnected) document.documentElement.append(this.host);
    this.host.hidden = false;
    this.visible = true;
    cancelAnimationFrame(this.frame);
    this.tick();
  }

  update(patch: Partial<BubbleState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...patch };
    this.render();
  }

  hide(): void {
    this.visible = false;
    this.host.hidden = true;
    this.anchor = null;
    cancelAnimationFrame(this.frame);
  }

  private tick = (): void => {
    if (!this.visible || !this.anchor) return;
    if (!this.anchor.isConnected || !isVisible(this.anchor)) {
      this.hide();
      return;
    }
    this.place();
    this.frame = requestAnimationFrame(this.tick);
  };

  private place(): void {
    if (!this.anchor) return;
    const rect = this.anchor.getBoundingClientRect();
    const width = Math.min(360, Math.max(280, Math.round(rect.width)));
    this.card.style.width = `${width}px`;
    const height = this.card.offsetHeight;
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin && rect.top - height - 6 >= margin) top = rect.top - height - 6;
    this.host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  private renderPassword(): void {
    if (!this.state) return;
    const { password } = this.state;
    this.value.textContent = this.revealed ? password : mask(password);
    this.value.classList.toggle('masked', !this.revealed);
    this.eye.replaceChildren(icon(this.revealed ? ICON_EYE_OFF : ICON_EYE));
    const label = t(this.revealed ? 'bubbleHide' : 'bubbleReveal');
    this.eye.setAttribute('aria-label', label);
    this.eye.title = label;
  }

  private render(): void {
    if (!this.state) return;
    const { bits, strength, autofilled, touchId, busy, error } = this.state;
    this.renderPassword();
    this.bits.textContent = t('bubbleBits', String(Math.floor(bits)));
    this.strength.textContent = strengthLabel(strength);
    this.strength.className = `strength strength-${strength}`;
    this.use.textContent = t(autofilled ? 'bubbleKeep' : 'bubbleUse');
    this.touchLabel.textContent = busy ? t('bubbleBusy') : t(touchId ? 'bubbleTouchId' : 'bubbleFillSubmit');
    this.use.disabled = busy;
    this.touch.disabled = busy;
    this.regen.disabled = busy;
    this.error.hidden = !error;
    this.error.textContent = error ?? '';
  }
}
