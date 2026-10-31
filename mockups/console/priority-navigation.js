/* Private, offline navigation hierarchy study. Existing anchors, route guards,
 * case relationships and presentation modules remain the authority. */
(() => {
  'use strict';
  const nav = document.querySelector('.sidebar');
  if (!nav) return;
  const phone = matchMedia('(max-width:699px)');
  if (!window.ProgressMock) {
    const study = document.createElement('a');
    study.id = 'navigation-layout-link'; study.href = 'navigation-investigation.html';
    study.textContent = 'Separate investigation layout study →';
    document.querySelector('.preview-tools').append(study);
  }
  const primary = document.createElement('div');
  primary.className = 'priority-primary';
  const heading = text => Object.assign(document.createElement('div'), { className: 'priority-label', textContent: text });
  primary.append(heading('Operate'));
  const move = (parent, ids) => ids.forEach(id => parent.append(document.getElementById(id)));
  move(primary, ['nav-approvals', 'nav-investigations']);
  const button = document.createElement('button');
  button.id = 'priority-more'; button.type = 'button'; button.className = 'priority-more';
  button.textContent = 'More'; button.setAttribute('aria-controls', 'priority-secondary');
  const secondary = document.createElement('div');
  secondary.id = 'priority-secondary'; secondary.className = 'priority-secondary';
  const groups = [
    ['Explore', ['nav-overview', 'nav-workflows', 'nav-resources', 'clusters-nav']],
    ['Manage', ['nav-governance', 'nav-administration']]
  ].map(([name, ids]) => {
    const group = document.createElement('div'); group.className = 'priority-group';
    group.append(heading(name)); move(group, ids); secondary.append(group); return group;
  });
  const note = nav.querySelector('.nav-note');
  note.textContent = 'Navigation study · visibility follows the existing access and topology fixtures.';
  nav.replaceChildren(primary, button, secondary, note);
  nav.classList.add('priority-navigation');
  // The inherited control is retained for legacy route/focus code, not exposed
  // as a second competing mobile disclosure.
  document.getElementById('mobile-menu').hidden = true;
  const links = [...nav.querySelectorAll('a')];
  let open = false;
  function render() {
    const active = secondary.querySelector('a[aria-current="page"]:not([hidden])');
    button.setAttribute('aria-label', active ? `More navigation, current section: ${active.textContent.trim()}` : 'More navigation');
    button.dataset.current = String(Boolean(active));
    button.title = active ? `Current section: ${active.textContent.trim()}` : 'Secondary destinations';
    button.hidden = !phone.matches;
    button.setAttribute('aria-expanded', String(phone.matches && open));
    secondary.hidden = phone.matches && !open;
    for (const group of groups) group.hidden = ![...group.querySelectorAll('a')].some(a => !a.hidden);
    // ResizeObserver in the inherited UX shell also measures this; the
    // navigation no longer reserves space for an unused full-menu control.
    document.getElementById('app').style.setProperty('--ux-mobile-nav-offset', '0px');
  }
  function close(returnFocus = false) {
    if (!open) return;
    open = false;
    if (returnFocus || secondary.contains(document.activeElement)) button.focus({ preventScroll: !returnFocus });
    render();
  }
  button.addEventListener('click', () => { open = !open; render(); });
  nav.addEventListener('keydown', event => {
    if (phone.matches && open && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    }
  });
  nav.addEventListener('click', event => {
    const a = event.target.closest('a[href]');
    if (a && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) close();
  });
  nav.addEventListener('focusin', event => {
    const target = event.target;
    if (!phone.matches || !open || !target.matches('.nav-link')) return;
    // Native Tab can consider a link visible even when a fixed composer
    // covers its lower edge. Recheck ONLY the newly focused navigation link
    // after native focus scrolling; never anchor subsequent manual reading.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!phone.matches || !open || document.activeElement !== target) return;
      const composer = document.querySelector('.composer');
      const header = document.querySelector('.app-header');
      const top = getComputedStyle(header).position === 'sticky' ? Math.max(8, header.getBoundingClientRect().bottom + 8) : 8;
      const bottom = composer && getComputedStyle(composer).position === 'fixed' ? Math.min(innerHeight, composer.getBoundingClientRect().top) - 8 : innerHeight - 8;
      const box = target.getBoundingClientRect();
      if (bottom <= top) return;
      const delta = box.top < top ? box.top - top : box.bottom > bottom ? box.bottom - bottom : 0;
      if (Math.abs(delta) > 0.5) scrollBy({ top: delta, behavior: 'instant' });
    }));
  });
  document.addEventListener('pointerdown', event => { if (!nav.contains(event.target)) close(); }, true);
  document.addEventListener('focusin', event => { if (!nav.contains(event.target)) close(); });
  addEventListener('hashchange', () => { close(); render(); });
  phone.addEventListener('change', () => {
    open = phone.matches && secondary.contains(document.activeElement);
    if (!phone.matches && document.activeElement === button) {
      (nav.querySelector('a[aria-current="page"]:not([hidden])') || links.find(a => !a.hidden))?.focus({ preventScroll: true });
    }
    render();
  });
  // Observe the original nodes, not menu clones. The existing renderer still
  // supplies both visibility and current-section state, including denial.
  const observer = new MutationObserver(render);
  links.forEach(a => observer.observe(a, { attributes: true, attributeFilter: ['hidden', 'aria-current'] }));
  render();
  window.PriorityNavigation = Object.freeze({ ready: true });
})();
