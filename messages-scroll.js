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
