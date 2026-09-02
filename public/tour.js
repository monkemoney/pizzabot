'use strict';

/**
 * First-run product tour.
 *
 * Shown once per user per browser. The key carries the username, so two people
 * sharing a terminal each get their own first run, and a version suffix so a
 * future rewrite can re-show it without stranding anyone who already dismissed
 * the old one.
 *
 * COPY LIVES HERE, in a {he,en} map, rather than going through i18n.js's
 * HE2EN. Two reasons: this is its own surface with its own voice (the same
 * argument that gives the public menu MENU_HE2EN and the wizard OB_HE2EN), and
 * HE2EN keys a string by its Hebrew, which is the wrong direction for copy
 * being written English-first. This map is already the shape HE2EN is being
 * migrated to, so it folds in rather than fighting.
 */

(function () {
  const VERSION = 'v1';

  const T = {
    skip:  { he: 'דלג', en: 'Skip' },
    next:  { he: 'הבא', en: 'Next' },
    back:  { he: 'הקודם', en: 'Back' },
    done:  { he: 'יאללה, נתחיל', en: "Let's go" },
    steps: [
      {
        anchor: null,
        title: { he: 'ברוך הבא 👋', en: 'Welcome 👋' },
        body:  { he: 'סיור קצר של דקה על המסכים שתשתמש בהם כל יום. אפשר לדלג ולחזור אליו מההגדרות.',
                 en: 'A one-minute tour of the screens you will use every day. You can skip it and come back from Settings.' },
      },
      {
        anchor: 'orders',
        title: { he: 'הזמנות נכנסות', en: 'Incoming orders' },
        body:  { he: 'כל הזמנה חדשה מופיעה כאן עם הפריטים המלאים וטיימר. אישור בלחיצה, עם זמן הכנה מוכן מראש — והלקוח מקבל הודעה מיד.',
                 en: 'Every new order lands here with its full items and a timer. Approve in one tap with a ready-made prep time — the customer is told immediately.' },
      },
      {
        anchor: 'products',
        title: { he: 'התפריט והמלאי', en: 'Menu and stock' },
        body:  { he: 'מנות, תוספות ומחירים. נגמרו הזיתים? כיבוי אחד, והבוט מפסיק להציע אותם באמצע שיחה.',
                 en: 'Dishes, toppings and prices. Out of olives? One toggle, and the bot stops offering them mid-conversation.' },
      },
      {
        anchor: 'inbox',
        title: { he: 'שיחה עם לקוח', en: 'Talk to a customer' },
        body:  { he: 'רוצה להתערב בשיחה? השתלט עליה, והבוט נעצר. חוזר אליו לבד אחרי שאתה מפסיק לענות — לקוח לא נשאר תקוע.',
                 en: 'Want to step in? Take the conversation over and the bot stops. It hands back on its own once you stop replying, so nobody is left waiting.' },
      },
      {
        anchor: 'settings',
        title: { he: 'שעות, אזורים ומס', en: 'Hours, zones and tax' },
        body:  { he: 'שעות פעילות, אזורי משלוח ודמי משלוח, ושיעור המס לפי הכתובת שלך. הבוט קורא את זה חי — אין פרסום ואין דיפלוי.',
                 en: 'Opening hours, delivery zones and fees, and the tax rate for your address. The bot reads this live — nothing to publish, nothing to deploy.' },
      },
    ],
  };

  const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'he');
  const t = (o) => (o && (o[lang()] ?? o.he)) || '';

  function seenKey() {
    let who = '';
    try { who = localStorage.getItem('username') || ''; } catch { /* blocked */ }
    return `tour_seen_${VERSION}:${who}`;
  }

  /** The visible anchor, or null — the sidebar is hidden on mobile and the
   *  mobile bar is hidden on desktop, so ask which one is actually on screen
   *  rather than assuming a breakpoint. */
  function anchorEl(name) {
    if (!name) return null;
    for (const id of [`tab-${name}`, `mobile-tab-${name}`]) {
      const el = document.getElementById(id);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function injectStyles() {
    if (document.getElementById('tour-styles')) return;
    const css = `
      .tour-veil{position:fixed;inset:0;z-index:2000;background:rgba(17,24,39,.55);
        opacity:0;transition:opacity .25s ease}
      .tour-veil.on{opacity:1}
      .tour-hole{position:fixed;z-index:2001;border-radius:10px;pointer-events:none;
        box-shadow:0 0 0 9999px rgba(17,24,39,.55),0 0 0 3px var(--color-brand,#5e17eb);
        transition:top .3s cubic-bezier(.2,.7,.3,1),left .3s cubic-bezier(.2,.7,.3,1),
                   width .3s,height .3s}
      .tour-card{position:fixed;z-index:2002;width:min(340px,calc(100vw - 32px));
        background:var(--color-surface,#fff);border-radius:14px;padding:20px;
        box-shadow:0 20px 50px -16px rgba(17,24,39,.45);
        font-family:inherit;opacity:0;transform:translateY(8px);
        transition:opacity .25s ease,transform .25s ease}
      .tour-card.on{opacity:1;transform:none}
      .tour-card h4{margin:0 0 8px;font-size:1.05rem;font-weight:700;color:var(--color-text,#111827)}
      .tour-card p{margin:0 0 18px;font-size:.9rem;line-height:1.6;color:var(--color-text-secondary,#4b5563)}
      .tour-foot{display:flex;align-items:center;gap:10px}
      .tour-dots{display:flex;gap:5px;flex:1}
      .tour-dot{width:6px;height:6px;border-radius:50%;background:var(--color-border-strong,#d1d5db)}
      .tour-dot.on{background:var(--color-brand,#5e17eb);width:16px;border-radius:3px}
      .tour-btn{border:0;font:inherit;font-size:.85rem;font-weight:700;border-radius:8px;
        padding:8px 15px;cursor:pointer}
      .tour-next{background:var(--color-brand,#5e17eb);color:#fff}
      .tour-ghost{background:transparent;color:var(--color-text-secondary,#4b5563);padding:8px 10px}
      @media (prefers-reduced-motion:reduce){
        .tour-veil,.tour-hole,.tour-card{transition:none}
      }`;
    const s = document.createElement('style');
    s.id = 'tour-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  let i = 0, veil, hole, card;

  function place() {
    const step = T.steps[i];
    const el = anchorEl(step.anchor);

    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 6;
      hole.style.display = 'block';
      hole.style.top    = `${r.top - pad}px`;
      hole.style.left   = `${r.left - pad}px`;
      hole.style.width  = `${r.width + pad * 2}px`;
      hole.style.height = `${r.height + pad * 2}px`;
      veil.style.background = 'transparent';   // the hole's own shadow is the veil

      // Below the anchor when there is room, above it otherwise; clamped so the
      // card never leaves the viewport on a short screen.
      const cardH = card.offsetHeight || 190;
      const below = r.bottom + 14;
      const top   = (below + cardH < window.innerHeight - 12) ? below
                  : Math.max(12, r.top - cardH - 14);
      card.style.top = `${top}px`;

      const cardW = card.offsetWidth || 340;
      let left = r.left;
      if (left + cardW > window.innerWidth - 12) left = window.innerWidth - cardW - 12;
      card.style.left = `${Math.max(12, left)}px`;
    } else {
      hole.style.display = 'none';
      veil.style.background = 'rgba(17,24,39,.55)';
      card.style.top  = '50%';
      card.style.left = '50%';
      card.style.transform = 'translate(-50%,-50%)';
    }
  }

  function render() {
    const step = T.steps[i];
    const last = i === T.steps.length - 1;
    card.innerHTML = `
      <h4></h4>
      <p></p>
      <div class="tour-foot">
        <div class="tour-dots">${T.steps.map((_, n) =>
          `<span class="tour-dot${n === i ? ' on' : ''}"></span>`).join('')}</div>
        ${i > 0 ? `<button class="tour-btn tour-ghost" data-act="back"></button>` : ''}
        ${!last ? `<button class="tour-btn tour-ghost" data-act="skip"></button>` : ''}
        <button class="tour-btn tour-next" data-act="next"></button>
      </div>`;
    // textContent, never innerHTML — copy is data, and a business name could
    // one day be interpolated into one of these strings.
    card.querySelector('h4').textContent = t(step.title);
    card.querySelector('p').textContent  = t(step.body);
    const set = (act, val) => { const b = card.querySelector(`[data-act="${act}"]`); if (b) b.textContent = val; };
    set('back', t(T.back));
    set('skip', t(T.skip));
    set('next', last ? t(T.done) : t(T.next));

    card.querySelectorAll('[data-act]').forEach(b =>
      b.addEventListener('click', () => {
        const a = b.dataset.act;
        if (a === 'skip') return finish();
        if (a === 'back') { i--; render(); return; }
        if (i === T.steps.length - 1) return finish();
        i++; render();
      }));

    card.style.transform = '';
    place();
    requestAnimationFrame(() => card.classList.add('on'));
  }

  function finish() {
    try { localStorage.setItem(seenKey(), '1'); } catch { /* blocked — it will show again, which is survivable */ }
    window.removeEventListener('resize', place);
    [veil, hole, card].forEach(n => n && n.remove());
    veil = hole = card = null;
  }

  function start() {
    // Idempotent: clear any prior instance rather than guarding on a variable
    // that could still point at a detached node. A replay that silently does
    // nothing is worse than one that restarts twice.
    document.querySelectorAll('.tour-veil,.tour-hole,.tour-card').forEach(n => n.remove());
    window.removeEventListener('resize', place);
    veil = hole = card = null;

    injectStyles();
    veil = document.createElement('div'); veil.className = 'tour-veil';
    hole = document.createElement('div'); hole.className = 'tour-hole';
    card = document.createElement('div'); card.className = 'tour-card';
    document.body.append(veil, hole, card);
    veil.addEventListener('click', finish);
    window.addEventListener('resize', place);
    requestAnimationFrame(() => veil.classList.add('on'));
    i = 0;
    render();
  }

  /** Replayable from Settings — a tour you cannot see twice is a tour nobody
   *  can show a colleague. */
  window.startTour = () => start();

  window.addEventListener('DOMContentLoaded', () => {
    let seen = null;
    try { seen = localStorage.getItem(seenKey()); } catch { /* blocked */ }
    if (seen) return;
    // After the dashboard has painted and the role-gated nav buttons have been
    // un-hidden — anchoring to a display:none button would spotlight nothing.
    setTimeout(start, 900);
  });
})();
