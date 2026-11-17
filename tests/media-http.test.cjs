const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { createMediaHttpServer } = require('../dest/main/common/mediaHttp');

test('loopback media HTTP authenticates and dispatches playback controls', async (t) => {
    const token = 'a'.repeat(64);
    const status = { state: 'playing', title: 'Episode 1', positionSeconds: 42, volume: 50 };
    const player = {
        getControlStatus: async () => status,
        setPaused: async (paused) => { status.state = paused ? 'paused' : 'playing'; },
        setVolume: async (volume) => { status.volume = volume; },
        nextItem: async () => {
            if (status.title === 'Episode 2') return false;
            status.title = 'Episode 2';
            return true;
        },
    };
    let activePlayer = null;
    const server = createMediaHttpServer(token, () => activePlayer);
    server.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    await once(server, 'listening');

    const base = 'http://127.0.0.1:' + server.address().port + '/v1/';
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const getStatus = async () => (await fetch(base + 'status', { headers })).json();
    const post = (route, body) => fetch(base + route, { method: 'POST', headers, body });

    assert.equal((await fetch(base + 'status')).status, 401);
    assert.equal((await fetch(base + 'status', {
        headers: { Authorization: 'Bearer ' + 'b'.repeat(64) },
    })).status, 401);
    assert.deepEqual(await getStatus(), { state: 'idle' });
    assert.equal((await post('pause')).status, 409);

    activePlayer = player;
    assert.equal((await getStatus()).positionSeconds, 42);
    assert.equal((await post('pause')).status, 200);
    assert.equal((await getStatus()).state, 'paused');
    assert.equal((await post('resume')).status, 200);
    assert.equal((await getStatus()).state, 'playing');
    assert.equal((await post('volume', '{"volume":101}')).status, 400);
    assert.equal((await post('volume', '{')).status, 400);
    assert.equal((await getStatus()).volume, 50);
    assert.equal((await post('volume', '{"volume":30}')).status, 200);
    assert.equal((await getStatus()).volume, 30);
    assert.equal((await post('next')).status, 200);
    assert.equal((await getStatus()).title, 'Episode 2');
    const last = await post('next');
    assert.equal(last.status, 409);
    assert.deepEqual(await last.json(), { error: 'no_next_item' });
});

test('media library routes validate input and pass selected IDs to playback', async (t) => {
    const token = 'c'.repeat(64);
    const id = 'b'.repeat(32);
    const calls = [];
    const item = { itemGuid: id, title: '绝命毒师' };
    const server = createMediaHttpServer(token, () => null, {
        search: async query => { calls.push(query); return [item]; },
        seasons: async guid => { calls.push(guid); return [item]; },
        episodes: async guid => { calls.push(guid); return [item]; },
        play: async guid => { calls.push(guid); },
    });
    server.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    await once(server, 'listening');

    const base = 'http://127.0.0.1:' + server.address().port + '/v1/';
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    assert.equal((await fetch(base + 'search?q=title')).status, 401);
    assert.equal((await fetch(base + 'search?q=', { headers })).status, 400);
    assert.equal((await fetch(base + 'episodes?itemGuid=invalid', { headers })).status, 400);
    for (const route of ['search?q=' + encodeURIComponent(item.title), 'seasons?itemGuid=' + id, 'episodes?itemGuid=' + id]) {
        assert.deepEqual(await (await fetch(base + route, { headers })).json(), { items: [item] });
    }
    const play = await fetch(base + 'play', { method: 'POST', headers, body: JSON.stringify({ itemGuid: id }) });
    assert.deepEqual(await play.json(), { ok: true, itemGuid: id });
    assert.deepEqual(calls, [item.title, id, id, id]);
});
