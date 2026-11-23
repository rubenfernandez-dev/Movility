const discovery = document.querySelector('[data-home-discovery]');
const track = discovery.querySelector('.discovery-track');
const controls = discovery.querySelector('[data-discovery-controls]');
const previous = discovery.querySelector('[data-discovery-previous]');
const next = discovery.querySelector('[data-discovery-next]');
const cards = [...track.children];
let width = track.clientWidth;
let active = width ? Math.round(track.scrollLeft / width) : 0;

function update() {
  if (width && width === track.clientWidth) active = Math.round(track.scrollLeft / width);
  const maximum = track.scrollWidth - track.clientWidth;
  controls.hidden = maximum < 2;
  previous.setAttribute('aria-disabled', String(track.scrollLeft < 2));
  next.setAttribute('aria-disabled', String(track.scrollLeft >= maximum - 2));
}

function move(direction) {
  const target = Math.max(0, Math.min(cards.length - 1, active + direction));
  if (target === active) return;
  track.scrollTo({ left: target * width, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
new ResizeObserver(() => {
  const nextWidth = track.clientWidth;
  if (nextWidth && width !== nextWidth) {
    width = nextWidth;
    track.scrollTo({ left: active * width, behavior: 'auto' });
  }
  update();
}).observe(track);
update();
