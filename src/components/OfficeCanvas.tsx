import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { buildLayout } from '../../shared/layout.ts';
import { live } from '../net/live.ts';
import { OfficeView } from '../office/view.ts';

// Lienzo de la oficina con escalado pixelado. En pantallas estrechas no se encoge del todo:
// mantiene un tamaño mínimo y se puede desplazar en horizontal con el dedo.

const NARROW = 900;
const MIN_CSS_SCALE_NARROW = 1.55;
const LOG_RESERVE = 200;

const view = new OfficeView(live);

export function OfficeCanvas({ projectIds }: { projectIds: string[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const centered = useRef(false);
  // El plano solo cambia si cambia la lista de proyectos, no con cada avance de progreso.
  const idsKey = projectIds.join('|');
  const layout = useMemo(() => buildLayout(idsKey ? idsKey.split('|') : []), [idsKey]);

  useEffect(() => {
    view.attach(canvasRef.current!);
    return () => view.detach();
  }, []);

  useLayoutEffect(() => {
    view.setLayout(layout);
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const fit = () => {
      const { width: W, height: H } = layout;
      const dpr = window.devicePixelRatio || 1;
      const narrow = window.innerWidth < NARROW;
      const availW = wrap.clientWidth;
      // En escritorio se deja sitio debajo para el registro de actividad.
      const availH = window.innerHeight - wrap.getBoundingClientRect().top - LOG_RESERVE;
      let css = narrow ? Math.max(availW / W, MIN_CSS_SCALE_NARROW) : Math.min(availW / W, availH / H);
      if (!Number.isFinite(css) || css <= 0) css = 1;
      let dev = css * dpr;
      const whole = Math.floor(dev);
      if (whole >= 2 && whole / dev > 0.88) dev = whole;
      canvas.width = Math.round(W * dev);
      canvas.height = Math.round(H * dev);
      canvas.style.width = `${(W * dev) / dpr}px`;
      canvas.style.height = `${(H * dev) / dpr}px`;
      view.setScale(dev);
      if (narrow && !centered.current && wrap.scrollWidth > wrap.clientWidth) {
        wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) * 0.35;
        centered.current = true;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [layout]);

  return (
    <div className="office-scroll" ref={wrapRef}>
      <canvas ref={canvasRef} className="office-canvas" role="img" aria-label="Oficina en pixel art con los agentes trabajando" />
    </div>
  );
}
