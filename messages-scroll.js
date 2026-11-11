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
  }, { passive: false });
})();
