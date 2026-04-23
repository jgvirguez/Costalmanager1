import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Calculator as CalcIcon, Delete, GripHorizontal } from 'lucide-react';

interface CalculatorModalProps {
  onClose: () => void;
}

export function CalculatorModal({ onClose }: CalculatorModalProps) {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [pos, setPos] = useState({ x: window.innerWidth - 320, y: 80 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleNum = (num: string) => {
    setDisplay(prev => prev === '0' ? num : prev + num);
  };

  const handleOp = (op: string) => {
    setEquation(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const calculate = useCallback(() => {
    try {
      const result = eval((equation + display).replace(/x/g, '*'));
      setDisplay(String(result));
      setEquation('');
    } catch {
      setDisplay('Error');
    }
  }, [equation, display]);

  const clear = () => { setDisplay('0'); setEquation(''); };

  const del = () => {
    setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  };

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 288, e.clientX - dragOffset.current.x));
      const ny = Math.max(0, Math.min(window.innerHeight - 400, e.clientY - dragOffset.current.y));
      setPos({ x: nx, y: ny });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // Keyboard handler — solo actúa cuando la calculadora está visible
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // No interceptar si el foco está en un input/textarea de la app
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const { key } = e;
      if (/^[0-9.]$/.test(key)) { e.preventDefault(); handleNum(key); }
      else if (['+', '-', '*', '/'].includes(key)) { e.preventDefault(); handleOp(key); }
      else if (key === 'Enter' || key === '=') { e.preventDefault(); calculate(); }
      else if (key === 'Backspace') { e.preventDefault(); del(); }
      else if (key === 'Escape') { e.preventDefault(); onClose(); }
      else if (key.toLowerCase() === 'c') { e.preventDefault(); clear(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [display, equation, calculate]);

  return (
    <div
      className="fixed z-[9999] select-none"
      style={{ left: pos.x, top: pos.y, width: 288 }}
    >
      <div className="bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-700 overflow-hidden">
        {/* Barra de arrastre */}
        <div
          onMouseDown={onMouseDown}
          className="flex justify-between items-center px-5 py-3 cursor-grab active:cursor-grabbing bg-slate-800/60 border-b border-slate-700"
        >
          <div className="flex items-center gap-2">
            <CalcIcon className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Calculadora</span>
          </div>
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-slate-500" />
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="bg-slate-800 rounded-2xl p-4 mb-4 text-right ring-1 ring-slate-700 ring-inset shadow-inner">
            <div className="text-[10px] text-slate-500 font-mono h-4 mb-1">{equation}</div>
            <div className="text-3xl font-mono text-white tracking-tight overflow-x-auto whitespace-nowrap">{display}</div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button onClick={clear} className="col-span-2 py-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl font-black text-sm transition-colors">AC</button>
            <button onClick={del} className="py-3 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl flex items-center justify-center transition-colors"><Delete className="w-4 h-4" /></button>
            <button onClick={() => handleOp('/')} className="py-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl font-bold font-mono transition-colors">/</button>

            {[7,8,9].map(n => <button key={n} onClick={() => handleNum(String(n))} className="py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-mono text-lg font-bold transition-colors">{n}</button>)}
            <button onClick={() => handleOp('*')} className="py-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl font-bold font-mono transition-colors">X</button>

            {[4,5,6].map(n => <button key={n} onClick={() => handleNum(String(n))} className="py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-mono text-lg font-bold transition-colors">{n}</button>)}
            <button onClick={() => handleOp('-')} className="py-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl font-bold font-mono text-xl transition-colors">-</button>

            {[1,2,3].map(n => <button key={n} onClick={() => handleNum(String(n))} className="py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-mono text-lg font-bold transition-colors">{n}</button>)}
            <button onClick={() => handleOp('+')} className="py-3 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl font-bold font-mono text-xl transition-colors">+</button>

            <button onClick={() => handleNum('0')} className="col-span-2 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-mono text-lg font-bold transition-colors">0</button>
            <button onClick={() => handleNum('.')} className="py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-mono text-lg font-bold transition-colors">.</button>
            <button onClick={calculate} className="py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl font-black font-mono text-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95">=</button>
          </div>
        </div>
      </div>
    </div>
  );
}
