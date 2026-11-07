import { memo, useLayoutEffect, useRef, useState } from 'react';
import { useGame, type Line } from '../lib/store.ts';
import { Icon, SegText } from './ui.tsx';

const LineView = memo(function LineView({ line }: { line: Line }) {
  if (line.kind === 'echo') return <div className="text-primary/80">&gt; {line.segs[0]?.text}</div>;
  if (line.kind === 'prompt') return <div className="text-outline/70"><SegText segs={line.segs} /></div>;
  return <div className="min-h-[1lh]"><SegText segs={line.segs} /></div>;
});

const RENDER_LIMIT = 800;

export function Terminal() {
  const { lines, partial } = useGame();
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [lines, partial, pinned]);

  const onScroll = () => {
    const el = ref.current!;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={onScroll}
        className="scroll-thin h-[46vh] min-h-[300px] lg:h-[52vh] overflow-y-auto rounded-lg p-3 font-mono text-[12.5px] leading-[1.45] whitespace-pre-wrap break-words border border-surface-high/30 shadow-inner bg-surface-lowest/80 text-[#cfc6bd]"
        aria-live="polite"
      >
        {lines.slice(-RENDER_LIMIT).map((l) => <LineView key={l.id} line={l} />)}
        {partial.length > 0 && <div><SegText segs={partial} /></div>}
      </div>
      {!pinned && (
        <button
          className="btn btn-primary absolute bottom-3 right-4 shadow-lg"
          onClick={() => { setPinned(true); }}
        >
          <Icon name="arrow_downward" className="text-xs" /> Latest
        </button>
      )}
    </div>
  );
}
