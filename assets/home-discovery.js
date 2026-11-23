const discovery = document.querySelector('[data-home-discovery]');
const track = discovery.querySelector('.discovery-track');
const controls = discovery.querySelector('[data-discovery-controls]');
const previous = discovery.querySelector('[data-discovery-previous]');
const next = discovery.querySelector('[data-discovery-next]');
const toggle = discovery.querySelector('[data-discovery-toggle]');
const cards = [...track.children];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let width = track.clientWidth;
let active = width ? Math.round(track.scrollLeft / width) : 0;
let paused = motion.matches;
let timer;

function update() {
  if (width && width === track.clientWidth) active = Math.round(track.scrollLeft / width);
  const maximum = track.scrollWidth - track.clientWidth;
  controls.hidden = maximum < 2;
  previous.setAttribute('aria-disabled', String(track.scrollLeft < 2));
  next.setAttribute('aria-disabled', String(track.scrollLeft >= maximum - 2));
}

function show(target, smooth = true) {
  track.scrollTo({ left: target * width, behavior: smooth && !motion.matches ? 'smooth' : 'auto' });
}

function move(direction) {
  const target = Math.max(0, Math.min(cards.length - 1, active + direction));
  if (target === active) return;
  show(target);
}

function restartRotation() {
  clearInterval(timer);
  discovery.removeAttribute('data-rotating');
  toggle.textContent = paused ? '▶' : 'Ⅱ';
  toggle.setAttribute('aria-label', paused ? toggle.dataset.play : toggle.dataset.pause);
  if (paused || document.hidden || discovery.matches(':hover')) return;
  discovery.setAttribute('data-rotating', '');
  timer = setInterval(() => {
    const target = (active + 1) % cards.length;
    show(target, target !== 0);
  }, 3000);
}

function pauseRotation() {
  if (paused) return;
  paused = true;
  restartRotation();
}

toggle.addEventListener('click', () => {
  paused = !paused;
  restartRotation();
});
discovery.addEventListener('focusin', event => {
  if (event.target !== toggle) pauseRotation();
});
discovery.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') restartRotation();
});
discovery.addEventListener('pointerleave', event => {
  if (event.pointerType === 'mouse') restartRotation();
});
document.addEventListener('visibilitychange', restartRotation);
motion.addEventListener('change', event => {
  if (event.matches) pauseRotation();
});
track.addEventListener('pointerdown', pauseRotation, { passive: true });
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
restartRotation();
