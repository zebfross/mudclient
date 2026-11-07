// Minimal telnet client for MUDs: option negotiation, GMCP, echo state, GA/EOR prompts.
// Deliberately declines MCCP so the stream stays uncompressed (simpler, bandwidth is tiny).
import net from 'node:net';
import { EventEmitter } from 'node:events';

const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, GA = 249, SE = 240, EOR = 239;
const OPT = { ECHO: 1, SGA: 3, TTYPE: 24, EOR: 25, NAWS: 31, GMCP: 201 } as const;
const ACCEPT_WILL = new Set<number>([OPT.ECHO, OPT.SGA, OPT.EOR, OPT.GMCP]);
const ACCEPT_DO = new Set<number>([OPT.TTYPE, OPT.NAWS]);

export interface TelnetOptions {
  host: string;
  port: number;
  clientName: string;
  gmcpSupports: string[];
  cols?: number;
  rows?: number;
}

export interface TelnetEvents {
  text: [string];
  prompt: [];
  gmcp: [string, unknown];
  echo: [boolean]; // true = local echo on (normal), false = server is hiding input (password)
  open: [];
  close: [string];
}

export class TelnetClient extends EventEmitter<TelnetEvents> {
  private sock: net.Socket;
  private state: 'data' | 'iac' | 'cmd' | 'sb' | 'sb_iac' = 'data';
  private cmd = 0;
  private sbBuf: number[] = [];
  private textBuf: number[] = [];
  private answered = new Map<string, boolean>();
  private opts: TelnetOptions;

  constructor(opts: TelnetOptions) {
    super();
    this.opts = opts;
    this.sock = net.connect(opts.port, opts.host);
    this.sock.setNoDelay(true);
    this.sock.on('connect', () => this.emit('open'));
    this.sock.on('data', (d) => this.feed(d as Buffer));
    this.sock.on('close', () => this.emit('close', 'connection closed'));
    this.sock.on('error', (e) => this.emit('close', e.message));
  }

  send(line: string) {
    // Escape literal 0xFF bytes per telnet rules.
    const bytes = Buffer.from(line + '\r\n', 'latin1');
    const out: number[] = [];
    for (const b of bytes) { out.push(b); if (b === IAC) out.push(IAC); }
    this.sock.write(Buffer.from(out));
  }

  sendGmcp(pkg: string, data?: unknown) {
    const payload = data === undefined ? pkg : `${pkg} ${JSON.stringify(data)}`;
    this.sock.write(Buffer.concat([
      Buffer.from([IAC, SB, OPT.GMCP]), Buffer.from(payload, 'utf8'), Buffer.from([IAC, SE]),
    ]));
  }

  close() { this.sock.destroy(); }

  private raw(...bytes: number[]) { this.sock.write(Buffer.from(bytes)); }

  private flushText() {
    if (this.textBuf.length) {
      this.emit('text', Buffer.from(this.textBuf).toString('latin1'));
      this.textBuf = [];
    }
  }

  private feed(data: Buffer) {
    for (const b of data) {
      switch (this.state) {
        case 'data':
          if (b === IAC) this.state = 'iac';
          else this.textBuf.push(b);
          break;
        case 'iac':
          if (b === IAC) { this.textBuf.push(IAC); this.state = 'data'; }
          else if (b === WILL || b === WONT || b === DO || b === DONT) { this.cmd = b; this.state = 'cmd'; }
          else if (b === SB) { this.sbBuf = []; this.state = 'sb'; }
          else {
            if (b === GA || b === EOR) { this.flushText(); this.emit('prompt'); }
            this.state = 'data';
          }
          break;
        case 'cmd':
          this.flushText();
          this.negotiate(this.cmd, b);
          this.state = 'data';
          break;
        case 'sb':
          if (b === IAC) this.state = 'sb_iac';
          else this.sbBuf.push(b);
          break;
        case 'sb_iac':
          if (b === SE) { this.flushText(); this.subnegotiation(this.sbBuf); this.state = 'data'; }
          else { this.sbBuf.push(b); this.state = 'sb'; } // IAC IAC inside SB
          break;
      }
    }
    this.flushText();
  }

  private negotiate(cmd: number, opt: number) {
    const key = `${cmd}:${opt}`;
    if (cmd === WILL) {
      const ok = ACCEPT_WILL.has(opt);
      if (opt === OPT.ECHO) this.emit('echo', false);
      if (this.answered.get(key) === ok) return;
      this.answered.set(key, ok);
      this.raw(IAC, ok ? DO : DONT, opt);
      if (ok && opt === OPT.GMCP) {
        this.sendGmcp('Core.Hello', { client: this.opts.clientName, version: '0.1' });
        this.sendGmcp('Core.Supports.Set', this.opts.gmcpSupports);
      }
    } else if (cmd === WONT) {
      if (opt === OPT.ECHO) this.emit('echo', true);
      if (this.answered.get(key)) return;
      this.answered.set(key, true);
      this.raw(IAC, DONT, opt);
    } else if (cmd === DO) {
      const ok = ACCEPT_DO.has(opt);
      if (this.answered.get(key) === ok) return;
      this.answered.set(key, ok);
      this.raw(IAC, ok ? WILL : WONT, opt);
      if (ok && opt === OPT.NAWS) this.sendNaws();
    } else if (cmd === DONT) {
      if (this.answered.get(key)) return;
      this.answered.set(key, true);
      this.raw(IAC, WONT, opt);
    }
  }

  private sendNaws() {
    const w = this.opts.cols ?? 120, h = this.opts.rows ?? 50;
    this.raw(IAC, SB, OPT.NAWS, w >> 8, w & 255, h >> 8, h & 255, IAC, SE);
  }

  private subnegotiation(buf: number[]) {
    const opt = buf[0];
    if (opt === OPT.TTYPE && buf[1] === 1 /* SEND */) {
      this.sock.write(Buffer.concat([
        Buffer.from([IAC, SB, OPT.TTYPE, 0 /* IS */]), Buffer.from(this.opts.clientName), Buffer.from([IAC, SE]),
      ]));
    } else if (opt === OPT.GMCP) {
      const s = Buffer.from(buf.slice(1)).toString('utf8');
      const sp = s.indexOf(' ');
      const pkg = sp < 0 ? s : s.slice(0, sp);
      let data: unknown = null;
      if (sp >= 0) {
        try { data = JSON.parse(s.slice(sp + 1)); } catch { data = s.slice(sp + 1); }
      }
      this.emit('gmcp', pkg, data);
    }
  }
}
