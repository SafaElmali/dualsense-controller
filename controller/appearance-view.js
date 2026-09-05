export class AppearanceView {
  constructor({ onColor = () => {}, onAction = () => {} } = {}) {
    this.onColor = onColor; this.onAction = onAction;
    this.root = document.getElementById('appearance-tool');
    this.panel = document.getElementById('appearance-panel');
    this.button = document.getElementById('open-appearance');
    this.button.addEventListener('click', () => this.panel.hidden ? this.open() : this.close());
    document.getElementById('close-appearance').addEventListener('click', () => this.close(true));
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); this.close(true); }
    });
    document.addEventListener('pointerdown', event => { if (!this.root.contains(event.target)) this.close(); });
    document.addEventListener('focusin', event => { if (!this.root.contains(event.target)) this.close(); });
    this.place = () => {
      if (this.panel.hidden) return;
      const top = (window.visualViewport?.offsetTop || 0) + 12;
      const height = (window.visualViewport?.height || window.innerHeight) - 24;
      this.panel.style.maxHeight = `${Math.max(150, height)}px`;
      this.panel.style.setProperty('--appearance-shift', '0px');
      const bounds = this.panel.getBoundingClientRect();
      const shift = bounds.top < top ? top - bounds.top : Math.min(0, top + height - bounds.bottom);
      this.panel.style.setProperty('--appearance-shift', `${shift}px`);
    };
    window.addEventListener('resize', this.place);
    window.addEventListener('scroll', this.place, { passive: true });
    window.visualViewport?.addEventListener('resize', this.place);
    window.visualViewport?.addEventListener('scroll', this.place);
    this.resize = new ResizeObserver(this.place); this.resize.observe(this.panel);
    const tabs = [...this.root.querySelectorAll('[data-color-tab]')];
    for (const tab of tabs) {
      tab.addEventListener('click', () => this.selectTab(tab.dataset.colorTab));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs.find(item => item !== tab);
        this.selectTab(next.dataset.colorTab); next.focus();
      });
    }
    for (const kind of ['light', 'body']) {
      const input = this.input(kind), hex = document.getElementById(`appearance-${kind}-hex`);
      input.addEventListener('input', () => this.setColor(kind, input.value));
      input.addEventListener('change', () => this.onAction(kind, 'changed', { method: 'picker' }));
      hex.addEventListener('input', () => {
        const value = hex.value.trim();
        if (/^#?[0-9a-f]{6}$/i.test(value)) this.setColor(kind, '#' + value.replace('#', ''));
        else {
          const invalid = value.replace('#', '').length >= 6;
          hex.setAttribute('aria-invalid', String(invalid));
          document.getElementById(`appearance-${kind}-error`).textContent = invalid ? 'Use a six-digit hex color, like #A855F7.' : '';
        }
      });
      hex.addEventListener('change', () => {
        const valid = /^#?[0-9a-f]{6}$/i.test(hex.value.trim());
        hex.setAttribute('aria-invalid', String(!valid));
        document.getElementById(`appearance-${kind}-error`).textContent = valid ? '' : 'Use a six-digit hex color, like #A855F7.';
        if (valid) this.onAction(kind, 'changed', { method: 'hex' });
      });
      for (const button of document.querySelectorAll(`[data-color-panel="${kind}"] [data-color]`)) button.addEventListener('click', () => {
        this.setColor(kind, button.dataset.color); this.onAction(kind, 'changed', { method: 'preset' });
      });
      this.root.querySelector(`[data-color-reset="${kind}"]`).addEventListener('click', () => {
        this.setColor(kind, kind === 'light' ? '#0046ff' : '#e9eaf0'); this.onAction(kind, 'reset');
      });
      this.setColor(kind, input.value, false);
    }
  }

  input(kind) { return document.getElementById(`appearance-${kind}`); }
  setColor(kind, color, apply = true) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    this.input(kind).value = color;
    const hex = document.getElementById(`appearance-${kind}-hex`);
    hex.value = color.toUpperCase(); hex.setAttribute('aria-invalid', 'false');
    document.getElementById(`appearance-${kind}-error`).textContent = '';
    if (kind === 'light') this.root.style.setProperty('--light-color', color);
    for (const button of this.root.querySelectorAll(`[data-color-panel="${kind}"] [data-color]`)) button.setAttribute('aria-pressed', String(button.dataset.color === color.toLowerCase()));
    if (apply) this.onColor(kind, color);
  }
  selectTab(kind) {
    const next = this.root.querySelector(`[data-color-tab="${kind}"]`);
    if (!next || next.getAttribute('aria-selected') === 'true') return;
    for (const tab of this.root.querySelectorAll('[data-color-tab]')) {
      const selected = tab.dataset.colorTab === kind;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of this.root.querySelectorAll('[data-color-panel]')) panel.hidden = panel.dataset.colorPanel !== kind;
    this.place();
    this.onAction(kind, 'tab_selected');
  }
  open() { this.panel.hidden = false; this.button.setAttribute('aria-expanded', 'true'); this.place(); this.onAction('picker', 'opened'); }
  close(focus = false) { this.panel.hidden = true; this.button.setAttribute('aria-expanded', 'false'); if (focus) this.button.focus(); }
  dispose() {
    this.resize.disconnect();
    window.removeEventListener('resize', this.place); window.removeEventListener('scroll', this.place);
    window.visualViewport?.removeEventListener('resize', this.place); window.visualViewport?.removeEventListener('scroll', this.place);
  }
}
