(() => {
  const selector = '.messages-list, .conversation-list';
  const interactive = 'a, button, input, textarea, select, option, label, [contenteditable="true"]';

  document.querySelectorAll(selector).forEach((scroller) => {
    let active = false;
    let moved = false;
    let startY = 0;
    let startScroll = 0;
    let pointerId = null;

    scroller.addEventListener('pointerdown', (event) => {
      // Touch already has native kinetic scrolling; add grab-to-scroll for mouse/pen.
      if (event.pointerType === 'touch' || event.button !== 0 || event.target.closest(interactive)) return;
      active = true;
      moved = false;
      pointerId = event.pointerId;
      startY = event.clientY;
      startScroll = scroller.scrollTop;
      scroller.setPointerCapture?.(pointerId);
      scroller.classList.add('is-drag-scrolling');
    });

    scroller.addEventListener('pointermove', (event) => {
      if (!active || event.pointerId !== pointerId) return;
      const delta = event.clientY - startY;
      if (Math.abs(delta) > 3) moved = true;
      if (!moved) return;
      event.preventDefault();
      scroller.scrollTop = startScroll - delta;
    });

    const stop = (event) => {
      if (!active || (event.pointerId != null && event.pointerId !== pointerId)) return;
      active = false;
      scroller.classList.remove('is-drag-scrolling');
      try { scroller.releasePointerCapture?.(pointerId); } catch (_) {}
      pointerId = null;
    };
    scroller.addEventListener('pointerup', stop);
    scroller.addEventListener('pointercancel', stop);

    // Prevent a click after a real drag, while preserving normal conversation clicks.
    scroller.addEventListener('click', (event) => {
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    }, true);
  });
})();


/* ColegioLibre: wheel routing from anywhere in the middle chat column. */
(() => {
  const app = document.querySelector('.messages-app');
  const chat = document.querySelector('.chat-panel');
  const history = document.querySelector('#messages-list');
  const inbox = document.querySelector('#conversation-list');
  if (!app || !chat || !history || !inbox) return;

  const scrollByWheel = (element, delta) => {
    if (!element) return false;
    const limit = Math.max(0, element.scrollHeight - element.clientHeight);
    if (limit < 2) return false;
    const before = element.scrollTop;
    element.scrollTop = Math.max(0, Math.min(limit, before + delta));
    return Math.abs(element.scrollTop - before) > 0.1;
  };

  // Capture before other bubbling listeners and route the wheel explicitly.
  // This also handles the blank state, where the center is not scrollable itself.
  document.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof Element) || !chat.contains(target)) return;
    if (target.closest('textarea, input, select, [contenteditable="true"]')) return;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * scale;
    if (!delta) return;

    const composer = document.getElementById('message-form');
    const activeChat = composer && !composer.hidden;
    const primary = activeChat ? history : inbox;
    if (scrollByWheel(primary, delta)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // At the end of the inner scroll area, allow the page itself to move.
    // Do not trap the wheel when no scrolling is possible.
  }, { capture: true, passive: false });
})();
