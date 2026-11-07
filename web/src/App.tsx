import { useGame } from './lib/store.ts';
import { Header } from './components/Header.tsx';
import { Terminal } from './components/Terminal.tsx';
import { RoomDescription, RoomHeader } from './components/Room.tsx';
import { Compass } from './components/Panels.tsx';
import { CommandBar } from './components/CommandBar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { CardHead, terrainTint } from './components/ui.tsx';

export function App() {
  const { room } = useGame();
  return (
    <>
      <div className="backdrop" style={{ ['--tint' as string]: terrainTint(room?.terrain) }} />
      <Header />
      <main className="relative z-10 w-full pt-20 pb-4">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main column scrolls; the sidebar (map + tabbed panels) stays pinned on large screens. */}
          <div className="lg:col-span-8 flex flex-col gap-6 min-w-0">
            <div className="rounded-2xl border border-surface-high/50 shadow-2xl bg-surface-lowest/20 p-2.5 sm:p-6 flex flex-col gap-5 sm:gap-6">
              <RoomHeader />
              <section className="card p-3 sm:p-5 border-primary/30 flex flex-col gap-3.5 min-w-0">
                <CardHead icon="history_edu" title="Chronicle" right={<span className="label-caps text-outline font-medium">Live</span>} />
                <RoomDescription />
                <Terminal />
              </section>
            </div>
            <Sidebar className="lg:hidden" />
            <Compass />
            <CommandBar />
          </div>
          <aside className="hidden lg:flex lg:col-span-4 sticky top-20 h-[calc(100vh-6rem)] flex-col min-w-0">
            <Sidebar className="flex-1" />
          </aside>
        </div>
      </main>
    </>
  );
}
