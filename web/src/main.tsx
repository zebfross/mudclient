import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.tsx';
import { startConnection } from './lib/connection.ts';

startConnection();
if (import.meta.env.DEV) (window as any).game = (await import('./lib/store.ts')).game;
createRoot(document.getElementById('root')!).render(<App />);
