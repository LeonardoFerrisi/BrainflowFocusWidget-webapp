import { useEffect, useRef } from 'react';

/**
 * Live prediction history chart - the FocusBar equivalent from W_Focus.pde.
 * X axis: last N seconds, Y axis: 0..1 metric value, dashed threshold line.
 */
export default function PredictionChart({
  history,
  threshold,
  windowSec = 60,
  dark,
}: {
  history: { t: number; v: number }[];
  threshold: number;
  windowSec?: number;
  dark: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const W = canvas.clientWidth || 600;
    const H = 180;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const palette = dark
      ? { grid: '#333', text: '#aaa', threshold: '#e07b7b', trace: '#5b9bd9' }
      : { grid: '#e6e6e6', text: '#888', threshold: '#a63232', trace: '#3068a6' };

    const padL = 34;
    const padB = 18;
    const plotW = W - padL - 8;
    const plotH = H - padB - 8;
    const now = history.length ? history[history.length - 1].t : Date.now();

    const xOf = (t: number) =>
      padL + plotW * (1 - (now - t) / (windowSec * 1000));
    const yOf = (v: number) => 8 + plotH * (1 - v);

    // gridlines + y labels
    ctx.strokeStyle = palette.grid;
    ctx.fillStyle = palette.text;
    ctx.font = '10px Arial';
    for (let g = 0; g <= 4; g++) {
      const y = 8 + (plotH * g) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - 8, y);
      ctx.stroke();
      ctx.fillText((1 - g / 4).toFixed(2), 4, y + 3);
    }

    // threshold line
    ctx.strokeStyle = palette.threshold;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yOf(threshold));
    ctx.lineTo(W - 8, yOf(threshold));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = palette.threshold;
    ctx.fillText(`thr ${threshold.toFixed(1)}`, padL + 4, yOf(threshold) - 3);

    // prediction trace
    ctx.strokeStyle = palette.trace;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const p of history) {
      if (now - p.t > windowSec * 1000) continue;
      const x = xOf(p.t);
      const y = yOf(Math.max(0, Math.min(1.05, p.v)));
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // x label
    ctx.fillStyle = palette.text;
    ctx.fillText(`last ${windowSec}s`, padL, H - 4);
  }, [history, threshold, windowSec, dark]);

  return <canvas ref={ref} className="chart" />;
}
