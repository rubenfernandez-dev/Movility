const discovery = document.querySelector('[data-home-discovery]');
const track = discovery.querySelector('.discovery-track');
const controls = discovery.querySelector('[data-discovery-controls]');
const previous = discovery.querySelector('[data-discovery-previous]');
const next = discovery.querySelector('[data-discovery-next]');
const cards = [...track.children];

function update() {
  const maximum = track.scrollWidth - track.clientWidth;
  controls.hidden = maximum < 2;
  previous.setAttribute('aria-disabled', String(track.scrollLeft < 2));
  next.setAttribute('aria-disabled', String(track.scrollLeft >= maximum - 2));
}

function move(direction) {
  const start = cards[0].offsetLeft;
  const offsets = cards.map(card => card.offsetLeft - start);
  const position = track.scrollLeft;
  const target = direction > 0 ? offsets.find(offset => offset > position + 2) :
    offsets.findLast(offset => offset < position - 2);
  if (target === undefined) return;
  track.scrollTo({ left: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

previous.addEventListener('click', () => {
  if (previous.getAttribute('aria-disabled') === 'false') move(-1);
});
next.addEventListener('click', () => {
  if (next.getAttribute('aria-disabled') === 'false') move(1);
});
track.addEventListener('keydown', event => {
  if (event.target !== track || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  move(event.key === 'ArrowRight' ? 1 : -1);
});
track.addEventListener('scroll', update, { passive: true });
new ResizeObserver(update).observe(track);
update();
