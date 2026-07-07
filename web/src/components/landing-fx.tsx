'use client';

import { useEffect } from 'react';

export function LandingFx() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // scroll reveal
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

    // cursor spotlight
    const spots = Array.from(document.querySelectorAll<HTMLElement>('.spot'));
    const onMove = (ev: PointerEvent) => {
      for (const el of spots) {
        const r = el.getBoundingClientRect();
        if (ev.clientX < r.left - 40 || ev.clientX > r.right + 40 || ev.clientY < r.top - 40 || ev.clientY > r.bottom + 40) continue;
        el.style.setProperty('--mx', `${ev.clientX - r.left}px`);
        el.style.setProperty('--my', `${ev.clientY - r.top}px`);
      }
    };
    if (!reduce) window.addEventListener('pointermove', onMove, { passive: true });

    // count up
    if (!reduce) {
      const nums = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'));
      const cio = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          cio.unobserve(el);
          const target = Number(el.dataset.count);
          const suffix = el.dataset.suffix ?? '';
          const dur = 1100;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased).toLocaleString() + suffix;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      }, { threshold: 0.6 });
      nums.forEach((n) => cio.observe(n));
    }

    return () => {
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return null;
}
