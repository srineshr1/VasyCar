import { useRef, useEffect } from 'react';
import { SelfDrivingState, NETWORK_W1, NETWORK_W2 } from '../utils/selfDriving';

const INPUT_LABELS = ['L60', 'L30', 'L15', 'FWD', 'R15', 'R30', 'R60', 'SPD', 'LAT', 'HDG'];
const OUTPUT_LABELS = ['GAS', 'BRK', 'LFT', 'RGT'];
const OUTPUT_COLORS = ['#4ade80', '#f87171', '#60a5fa', '#fb923c'];

interface Props { state: SelfDrivingState | null; active: boolean; }

export default function NeuralNetPanel({ state, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CW = canvas.width, CH = canvas.height;
    ctx.clearRect(0, 0, CW, CH);
    if (!active || !state) return;

    const nIn = 10, nHid = 8, nOut = 4;
    const colX = [44, 152, 258];
    const marginY = 18;

    const nodeY = (count: number, idx: number) =>
      marginY + idx * ((CH - marginY * 2) / (count - 1));

    const inY = (i: number) => nodeY(nIn, i);
    const hidY = (i: number) => nodeY(nHid, i);
    const outY = (i: number) => nodeY(nOut, i);

    // W1 connections (inputs → hidden)
    for (let h = 0; h < nHid; h++) {
      for (let i = 0; i < nIn; i++) {
        const w = NETWORK_W1[h][i];
        if (w === 0) continue;
        const act = (state.inputs[i] ?? 0) * (state.hidden[h] ?? 0);
        const alpha = Math.min(0.75, (Math.abs(w) / 10) * act + 0.04);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = w > 0 ? '#4ade80' : '#f87171';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(colX[0], inY(i));
        ctx.lineTo(colX[1], hidY(h));
        ctx.stroke();
        ctx.restore();
      }
    }

    // W2 connections (hidden → outputs)
    for (let o = 0; o < nOut; o++) {
      for (let h = 0; h < nHid; h++) {
        const w = NETWORK_W2[o][h];
        if (w === 0) continue;
        const act = (state.hidden[h] ?? 0) * (state.outputs[o] ?? 0);
        const alpha = Math.min(0.75, (Math.abs(w) / 6) * act + 0.04);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = w > 0 ? '#4ade80' : '#f87171';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(colX[1], hidY(h));
        ctx.lineTo(colX[2], outY(o));
        ctx.stroke();
        ctx.restore();
      }
    }

    // Input nodes
    for (let i = 0; i < nIn; i++) {
      const act = state.inputs[i] ?? 0;
      const isSensor = i < 7;
      const color = isSensor ? (act < 0.5 ? '#f87171' : '#4ade80') : '#94a3b8';
      const r = 6;
      ctx.beginPath();
      ctx.arc(colX[0], inY(i), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.25 + act * 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(INPUT_LABELS[i], colX[0] - r - 3, inY(i) + 3);
    }

    // Hidden nodes
    for (let h = 0; h < nHid; h++) {
      const act = state.hidden[h] ?? 0;
      const r = 6;
      ctx.beginPath();
      ctx.arc(colX[1], hidY(h), r, 0, Math.PI * 2);
      ctx.fillStyle = '#818cf8';
      ctx.globalAlpha = 0.15 + act * 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#a5b4fc';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#c7d2fe';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`h${h}`, colX[1], hidY(h) + 2.5);
    }

    // Output nodes
    for (let o = 0; o < nOut; o++) {
      const act = state.outputs[o] ?? 0;
      const firing = act > 0.52;
      const r = 7;
      ctx.beginPath();
      ctx.arc(colX[2], outY(o), r, 0, Math.PI * 2);
      ctx.fillStyle = OUTPUT_COLORS[o];
      ctx.globalAlpha = 0.15 + act * 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = firing ? '#ffffff' : '#64748b';
      ctx.lineWidth = firing ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = firing ? '#ffffff' : '#94a3b8';
      ctx.font = `${firing ? 'bold ' : ''}8px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(OUTPUT_LABELS[o], colX[2] + r + 4, outY(o) + 3);
    }
  }, [state, active]);

  if (!active) return null;

  return (
    <div className="absolute top-16 right-4 bg-black/70 backdrop-blur-sm border border-white/15 rounded-lg overflow-hidden">
      <div className="px-3 py-1 border-b border-white/10 text-white/50 text-[9px] uppercase tracking-widest text-center">
        Neural Net
      </div>
      <canvas ref={canvasRef} width={290} height={316} style={{ display: 'block' }} />
    </div>
  );
}
