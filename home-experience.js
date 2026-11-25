(() => {
  const entrance = document.querySelector('.colego-entrance');
  const passage = entrance?.querySelector('.colego-passage');
  if (!passage || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let frame = 0;
  function draw() {
    frame = 0;
    const bounds = entrance.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (85 - bounds.top) / Math.max(1, bounds.height * .65)));
    passage.style.setProperty('--passage-x', `${-28 + progress * 63}%`);
    passage.style.setProperty('--passage-y', `${-26 + progress * 48}%`);
    passage.style.setProperty('--passage-angle', `${-12 + progress * 24}deg`);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule, {passive:true});
  schedule();
})();
