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
  }, { passive: false });
})();
