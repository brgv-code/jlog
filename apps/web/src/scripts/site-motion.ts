/*
 * Motion shared by the feature pages.
 *
 * - `[data-play]` gets `.run` when it scrolls into view, which starts its CSS
 *   sequence. With `data-play="7000"` the sequence restarts every 7 seconds
 *   while it stays on screen. Reduced motion gets `.run` once, and the CSS
 *   shows the finished state without transitions.
 * - `[data-wired]` draws a curved wire from every `[data-to="x"]` inside it to
 *   the `[data-id="x"]` it names, into the container's `svg.wires`, with a
 *   pulse travelling each one. Below 720px the columns stack and wires would
 *   cross the text, so they are not drawn.
 */
const NS = 'http://www.w3.org/2000/svg';
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function restart(el: HTMLElement) {
  el.classList.remove('run');
  void el.offsetWidth; // flush, so the next add replays the transitions
  el.classList.add('run');
}

export function play() {
  const els = document.querySelectorAll<HTMLElement>('[data-play]');
  if (!('IntersectionObserver' in window)) {
    for (const el of els) el.classList.add('run');
    return;
  }
  const timers = new Map<HTMLElement, number>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const every = Number(el.dataset.play) || 0;
        if (e.isIntersecting) {
          if (!el.classList.contains('run')) el.classList.add('run');
          if (every && !reduce && !timers.has(el)) {
            timers.set(
              el,
              window.setInterval(() => restart(el), every),
            );
          }
        } else if (timers.has(el)) {
          window.clearInterval(timers.get(el));
          timers.delete(el);
        }
      }
    },
    { threshold: 0.35 },
  );
  for (const el of els) io.observe(el);
}

function pulse(svg: SVGSVGElement, pathId: string, delay: number) {
  if (reduce) return;
  const dot = document.createElementNS(NS, 'rect');
  dot.setAttribute('class', 'pulse');
  dot.setAttribute('x', '-2.5');
  dot.setAttribute('y', '-2.5');
  dot.setAttribute('width', '5');
  dot.setAttribute('height', '5');
  const motion = document.createElementNS(NS, 'animateMotion');
  motion.setAttribute('dur', '2.6s');
  motion.setAttribute('begin', `-${delay % 2.6}s`);
  motion.setAttribute('repeatCount', 'indefinite');
  motion.setAttribute('keyPoints', '0;1;1');
  motion.setAttribute('keyTimes', '0;0.6;1');
  motion.setAttribute('calcMode', 'linear');
  const mpath = document.createElementNS(NS, 'mpath');
  mpath.setAttribute('href', `#${pathId}`);
  motion.appendChild(mpath);
  dot.appendChild(motion);
  svg.appendChild(dot);
}

let wireCount = 0;

function draw(root: HTMLElement) {
  const svg = root.querySelector<SVGSVGElement>('svg.wires');
  if (!svg) return;
  const box = root.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.replaceChildren();
  if (window.innerWidth < 720) return;
  let i = 0;
  for (const from of root.querySelectorAll<HTMLElement>('[data-to]')) {
    for (const id of (from.dataset.to ?? '').split(' ').filter(Boolean)) {
      const to = root.querySelector<HTMLElement>(`[data-id="${id}"]`);
      if (!to) continue;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x1 = a.right - box.left;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left - box.left;
      const y2 = b.top + b.height / 2 - box.top;
      const m = (x1 + x2) / 2;
      const path = document.createElementNS(NS, 'path');
      const pid = `w${root.dataset.wiredId}-${i}`;
      path.setAttribute('id', pid);
      path.setAttribute('d', `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`);
      svg.appendChild(path);
      pulse(svg, pid, i * 0.55);
      i++;
    }
  }
}

export function wires() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-wired]')) {
    root.dataset.wiredId = String(wireCount++);
    const redraw = () => requestAnimationFrame(() => draw(root));
    new ResizeObserver(redraw).observe(root);
    document.fonts?.ready.then(redraw);
  }
}
