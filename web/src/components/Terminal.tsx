import { memo, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGame, type Line } from '../lib/store.ts';
import { Icon, SegText } from './ui.tsx';

const LineView = memo(function LineView({ line }: { line: Line }) {
  if (line.kind === 'echo') return <div className="text-primary/80">&gt; {line.segs[0]?.text}</div>;
  if (line.kind === 'prompt') return <div className="text-outline/70"><SegText segs={line.segs} /></div>;
  return <div className="min-h-[1lh]"><SegText segs={line.segs} /></div>;
});

const RENDER_LIMIT = 800;
const HEIGHT_KEY = 'gaslamp.chronicleHeight';
const MIN_HEIGHT = 200;

function loadHeight(): number | null {
  try {
    const n = Number(localStorage.getItem(HEIGHT_KEY));
    return n >= MIN_HEIGHT ? n : null;
  } catch { return null; }
}

function saveHeight(n: number | null) {
  try {
    if (n == null) localStorage.removeItem(HEIGHT_KEY);
    else localStorage.setItem(HEIGHT_KEY, String(Math.round(n)));
  } catch { /* storage unavailable: the size just won't stick */ }
}

/** Keeps a dragged height on screen when the window is smaller than when it was set. */
export function clampHeight(n: number, viewport: number): number {
  return Math.max(MIN_HEIGHT, Math.min(n, Math.max(MIN_HEIGHT, viewport - 120)));
}

export function Terminal() {
  const { lines, partial } = useGame();
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  // null = the default responsive height; a number = the height the player dragged it to.
  const [height, setHeight] = useState<number | null>(loadHeight);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const startY = e.clientY;
    const startH = el.getBoundingClientRect().height;
    let last = startH;
    const move = (ev: PointerEvent) => {
      last = clampHeight(startH + ev.clientY - startY, window.innerHeight);
      setHeight(last);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      saveHeight(last);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const resetHeight = () => { setHeight(null); saveHeight(null); };

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [lines, partial, pinned, height]);

  const onScroll = () => {
    const el = ref.current!;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={onScroll}
        style={height != null ? { height: clampHeight(height, window.innerHeight) } : undefined}
        className="scroll-thin h-[46vh] min-h-[200px] lg:h-[52vh] overflow-y-auto rounded-lg p-3 font-mono text-[12.5px] leading-[1.45] whitespace-pre-wrap break-words border border-surface-high/30 shadow-inner bg-surface-lowest/80 text-[#cfc6bd]"
        aria-live="polite"
      >
        {lines.slice(-RENDER_LIMIT).map((l) => <LineView key={l.id} line={l} />)}
        {partial.length > 0 && <div><SegText segs={partial} /></div>}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the chronicle"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={resetHeight}
        className="group flex h-3 -mb-1.5 cursor-ns-resize touch-none items-center justify-center"
      >
        <div className="h-1 w-12 rounded-full bg-outline/30 transition-colors group-hover:bg-primary/60" />
      </div>
      {!pinned && (
        <button
          className="btn btn-primary absolute bottom-6 right-4 shadow-lg"
          onClick={() => { setPinned(true); }}
        >
          <Icon name="arrow_downward" className="text-xs" /> Latest
        </button>
      )}
    </div>
  );
}
