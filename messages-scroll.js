/* ColegioLibre — scroll from anywhere in the central conversation panel. */
(() => {
  const chat = document.querySelector('.chat-panel');
  const inbox = document.getElementById('conversation-list');
  const history = document.getElementById('messages-list');
  if (!chat || !inbox || !history) return;

  function scrollElement(el, delta) {
    if (!el) return false;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    if (max < 1) return false;
    const before = el.scrollTop;
    el.scrollTop = Math.max(0, Math.min(max, before + delta));
    return Math.abs(el.scrollTop - before) > 0.5;
  }

  // Capture wheel input even over the empty chat, header and safety banner.
  document.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (!(event.target instanceof Element) || !chat.contains(event.target)) return;
    if (event.target.closest('textarea, input, select, [contenteditable]')) return;
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    const delta = event.deltaY * factor;
    if (!delta) return;
    const chatOpen = !!document.querySelector('.message-form:not([hidden])');
    const target = chatOpen ? history : inbox;
    if (scrollElement(target, delta)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // If the conversation list/history cannot scroll (e.g. only two chats),
    // move the entire document. This is what the blank central area needs.
    const root = document.scrollingElement || document.documentElement;
    if (scrollElement(root, delta)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, {capture:true, passive:false});
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
