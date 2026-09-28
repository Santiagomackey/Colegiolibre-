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
