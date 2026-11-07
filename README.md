# Gaslamp: a web MUD client (Aardwolf first)

A browser UI for Aardwolf, styled from the "Gaslamp MUD Adventure" Stitch design (`design/`).
Browsers can't open telnet sockets, so a small Node relay sits in between:

```
browser (React) ⇄ WebSocket /ws ⇄ server/relay.ts ⇄ telnet ⇄ aardmud.org:4000
```

## Run

```sh
npm install
npm run dev        # relay on :4321 + Vite on http://localhost:5320
npm test           # parser/store tests
npm start          # production build served by the relay on :4321
```

Env: `MUD_HOST`, `MUD_PORT` (default aardmud.org:4000), `PORT` (relay, default 4321).

`node scripts/fakemud.mjs 4555` runs a tiny fake MUD with GMCP and tags for UI work without an
account: `PORT=4330 MUD_HOST=localhost MUD_PORT=4555 node server/relay.ts` after `npm run build`.

## Where the data comes from

| Panel | Source |
|---|---|
| Vitals, level, TNL, gold, enemy | GMCP `char.*` |
| Room name, exits, terrain, automap | GMCP `room.info` (map saved in localStorage) |
| Description, souls, objects | Aardwolf text tags `{rdesc}`, `{roomchars}`, `{roomobjs}`, enabled automatically after login |
| Satchel | hidden `invdata` command, refreshed after inventory verbs |
| Dispatches | GMCP `comm.channel` |
| Group | GMCP `group` |

## Layout

- `server/telnet.ts`: telnet negotiation (GMCP, TTYPE, NAWS, ECHO, GA/EOR). MCCP is declined.
- `server/relay.ts`: WebSocket bridge + static file server.
- `web/src/lib/store.ts`: turns the text/GMCP stream into UI state (ANSI, tags, hidden commands).
- `web/src/lib/mapper.ts`: room graph, grid layout, pathfinding.
- `web/src/components/`: the panels.
