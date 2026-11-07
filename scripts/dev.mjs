// Runs the relay and the Vite dev server together.
import { spawn } from 'node:child_process';
const procs = [
  spawn('node', ['--watch', 'server/relay.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
