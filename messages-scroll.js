<<<<<<< HEAD
/* Middle-panel scrolling: one small, non-animated wheel forwarder. */
(() => {
  const panel = document.querySelector('.chat-panel');
  const inbox = document.getElementById('conversation-list');
  const history = document.getElementById('messages-list');
  if (!panel || !inbox || !history) return;
  panel.addEventListener('wheel', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || !event.deltaY) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const open = !document.getElementById('message-form')?.hidden;
    // Native scrolling handles the open message history with momentum.
    if (open && history.contains(event.target)) return;
    const amount = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
    const target = open ? history : inbox;
    const max = Math.max(0, target.scrollHeight - target.clientHeight);
    const next = Math.max(0, Math.min(max, target.scrollTop + amount));
    if (Math.abs(next - target.scrollTop) > 0.5) {
      target.scrollTop = next;
      event.preventDefault();
      return;
    }
    if (open) return;

    // Empty chat panes have no history to scroll. Continue on the page
    // when the inbox is short or has reached its edge.
    const page = document.scrollingElement;
    if (!page) return;
    const pageMax = Math.max(0, page.scrollHeight - page.clientHeight);
    const pageNext = Math.max(0, Math.min(pageMax, page.scrollTop + amount));
    if (Math.abs(pageNext - page.scrollTop) > 0.5) {
      page.scrollTop = pageNext;
      event.preventDefault();
    }
=======
/* ColegioLibre: native-first scrolling, no document-wide wheel interception. */
(() => {
  const chat = document.querySelector('.chat-panel');
  const inbox = document.getElementById('conversation-list');
  const history = document.getElementById('messages-list');
  if (!chat || !inbox || !history) return;

  // The browser handles scrolling normally over messages and other scrollable content.
  // Redirect only wheel events on non-scrollable parts of the central panel.
  chat.addEventListener('wheel', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || !event.deltaY) return;
    if (event.target.closest('input, textarea, select, [contenteditable], .messages-list')) return;

    const chatOpen = !document.getElementById('message-form')?.hidden;
    const target = chatOpen ? history : inbox;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * scale;
    const max = target.scrollHeight - target.clientHeight;
    if (max <= 1) return; // Let the document scroll naturally when the list is short.

    const next = Math.max(0, Math.min(max, target.scrollTop + delta));
    if (Math.abs(next - target.scrollTop) < 0.5) return;
    target.scrollTop = next;
    event.preventDefault();
>>>>>>> b8ff0860b11a5eba587e534c079aaff3b779697d
  }, { passive: false });
})();
