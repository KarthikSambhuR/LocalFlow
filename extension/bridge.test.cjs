const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function bridge() {
  let listener, removed, updated;
  const sockets = [];
  class Socket {
    static OPEN = 1; static CONNECTING = 0;
    constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen(); }
  }
  const context = {
    WebSocket: Socket, console, Date, setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    chrome: {
      storage: { local: { get: (defaults, cb) => cb(defaults) }, onChanged: { addListener() {} } },
      tabs: { onRemoved: { addListener: fn => removed = fn }, onUpdated: { addListener: fn => updated = fn },
        query: (_, cb) => cb([]), sendMessage: () => Promise.resolve() },
      scripting: { executeScript: () => Promise.resolve() },
      runtime: { onConnect: { addListener() {} }, onMessage: { addListener: fn => listener = fn } }
    }
  };
  vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), context);
  return { sockets, removed: id => removed(id), updated: (id, info) => updated(id, info, {}),
    telemetry: (participants, speakers = [], tabId = 1, participantsChanged = false, selfDetected = false) => listener({
      type: 'MEETING_TELEMETRY', platform: 'google_meet', participants, speakers, participantsChanged, selfDetected
    }, { tab: { id: tabId } }, () => {}) };
}

test('roster extracted before app connects is replayed on open', () => {
  const b = bridge();
  b.telemetry([{ name: 'Alice_Frame' }]);
  assert.equal(b.sockets[0].sent.length, 0);
  b.sockets[0].open();
  assert.deepEqual(b.sockets[0].sent[0].participants, ['Alice_Frame']);
});
test('unchanged roster is delivered and silence explicitly clears speaker', () => {
  const b = bridge(); b.sockets[0].open();
  b.telemetry([{ name: 'Alice' }], [{ name: 'Alice', volume: 50 }]);
  assert.equal(b.sockets[0].sent.at(-1).speakerName, 'Alice');
  b.telemetry([{ name: 'Alice' }]);
  assert.equal(b.sockets[0].sent.at(-1).speakerName, '');
});
test('self and overlapping remote speakers are not mislabelled as one remote person', () => {
  const b = bridge(); b.sockets[0].open();
  b.telemetry([{ name: 'Me', isSelf: true }], [{ name: 'Me' }]);
  assert.equal(b.sockets[0].sent.at(-1).speakerName, '');
  b.telemetry([{ name: 'A' }, { name: 'B' }], [{ name: 'A' }, { name: 'B' }]);
  assert.equal(b.sockets[0].sent.at(-1).speakerName, '');
});
test('another meeting tab cannot overwrite active call; closing clears state', () => {
  const b = bridge(); b.sockets[0].open(); b.telemetry([{ name: 'Alice' }]);
  const count = b.sockets[0].sent.length;
  b.telemetry([{ name: 'Bob' }], [], 2);
  assert.equal(b.sockets[0].sent.length, count);
  b.removed(1);
  assert.deepEqual(b.sockets[0].sent.at(-2).participants, []);
  assert.equal(b.sockets[0].sent.at(-1).speakerName, '');
  b.telemetry([{ name: 'Bob' }], [], 2);
  assert.deepEqual(b.sockets[0].sent.at(-2).participants, ['Bob']);
});
test('navigation clears roster and speaker', () => {
  const b = bridge(); b.sockets[0].open(); b.telemetry([{ name: 'Alice' }]);
  b.updated(1, { status: 'loading' });
  assert.deepEqual(b.sockets[0].sent.at(-2).participants, []);
});

test('roster preserves sole remote identity when activity animation is absent', () => {
  const b = bridge(); b.sockets[0].open();
  b.telemetry([{ name: 'Me', isSelf: true }, { name: 'Alice', isSelf: false }]);
  assert.deepEqual(b.sockets[0].sent.at(-2).remoteParticipants, ['Alice']);
  assert.equal(b.sockets[0].sent.at(-1).speakerName, '');
  b.telemetry([{ name: 'Alice', isSelf: false }]);
  assert.equal(b.sockets[0].sent.at(-2).remoteParticipants, null);
  b.telemetry([{ name: 'Alice', isSelf: false }], [], 1, false, true);
  assert.deepEqual(b.sockets[0].sent.at(-2).remoteParticipants, ['Alice']);
});
test('Meet mute detection distinguishes muted from unmuted', () => {
  const source = fs.readFileSync('extension/injected.js', 'utf8');
  const start = source.indexOf('function isTileMuted(');
  const end = source.indexOf('function checkTileSpeakingVol', start);
  const isMuted = vm.runInNewContext('(' + source.slice(start, end).trim() + ')');
  const tile = label => ({ matches: () => false, querySelector: () => null,
    querySelectorAll: selector => selector === '[aria-label]' ? [{ getAttribute: () => label }] : [] });
  assert.equal(isMuted(tile('Microphone unmuted')), false);
  assert.equal(isMuted(tile('Microphone not muted')), false);
  assert.equal(isMuted(tile('Microphone muted')), true);
});
