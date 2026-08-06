import { useEffect, useRef } from 'react';

/**
 * Raw EEG sanity-check chart - stacked time-series traces, one per channel.
 * Mirrors the "nothing fancy" time series view used as a sanity check.
 */
export default function EegChart({
  data,
  names,
  dark,
}: {
  data: number[][];
  names: string[];
  dark: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const W = canvas.clientWidth || 800;
    const H = Math.max(140, data.length * 70);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const palette = dark
      ? { sep: '#333', baseline: '#444', trace: '#5b9bd9', label: '#ccc', sub: '#888' }
      : { sep: '#e0e0e0', baseline: '#ccc', trace: '#3068a6', label: '#555', sub: '#999' };

    const bandH = H / Math.max(1, data.length);
    data.forEach((row, i) => {
      const cy = bandH * i + bandH / 2;
      // channel separator + baseline
      ctx.strokeStyle = palette.sep;
      ctx.beginPath();
      ctx.moveTo(0, bandH * i);
      ctx.lineTo(W, bandH * i);
      ctx.stroke();
      ctx.strokeStyle = palette.baseline;
      ctx.beginPath();
      ctx.moveTo(70, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();

      // per-channel symmetric auto-scale, floor at ±50 uV
      let maxAbs = 50;
      for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v));
      const scale = (bandH / 2 - 6) / maxAbs;

      ctx.strokeStyle = palette.trace;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = row.length;
      for (let j = 0; j < n; j++) {
        const x = 70 + ((W - 80) * j) / Math.max(1, n - 1);
        const y = cy - row[j] * scale;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = palette.label;
      ctx.font = '11px Arial';
      ctx.fillText(names[i] ?? `Ch ${i}`, 8, cy + 4);
      ctx.fillStyle = palette.sub;
      ctx.fillText(`±${maxAbs.toFixed(0)}uV`, 8, cy + 16);
    });
  }, [data, names, dark]);

  return <canvas ref={ref} className="chart" />;
}
