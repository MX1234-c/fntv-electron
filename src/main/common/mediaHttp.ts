import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import express = require('express');
import { isItemGuid } from '../../preload/core/playTarget';
import type { BasePlayer } from '../../modules/players/types';

interface LibraryResult {
    itemGuid: string;
    title: string;
    type: string;
    tvTitle: string;
    seasonNumber: number;
    episodeNumber: number;
    positionSeconds: number;
    durationSeconds: number;
}

interface MediaLibrary {
    search(query: string): Promise<LibraryResult[]>;
    seasons(id: string): Promise<LibraryResult[]>;
    episodes(id: string): Promise<LibraryResult[]>;
    play(id: string): Promise<void>;
}

export class MediaHttpError extends Error {
    constructor(readonly status: number, readonly code: string) {
        super(code);
    }
}

export function createMediaHttpServer(
    token: string,
    getPlayer: () => BasePlayer | null,
    library?: MediaLibrary,
) {
    const app = express();
    const expected = Buffer.from('Bearer ' + token);

    app.disable('x-powered-by');
    app.use((req, res, next) => {
        const actual = Buffer.from(req.get('authorization') ?? '');
        res.set('Cache-Control', 'no-store');
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
            res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'unauthorized' });
            return;
        }
        next();
    });

    app.get('/v1/status', async (_req, res) => {
        const player = getPlayer();
        res.json(player ? await player.getControlStatus() : { state: 'idle' });
    });

    const requirePlayer: express.RequestHandler = (_req, res, next) => {
        const player = getPlayer();
        if (!player) {
            res.status(409).json({ error: 'no_active_player' });
            return;
        }
        res.locals.player = player;
        next();
    };

    for (const [route, paused] of [['pause', true], ['resume', false]] as const) {
        app.post('/v1/' + route, requirePlayer, async (_req, res) => {
            await (res.locals.player as BasePlayer).setPaused(paused);
            res.json({ ok: true });
        });
    }

    app.post('/v1/volume', express.json({ limit: '1kb' }), requirePlayer, async (req, res) => {
        const volume: unknown = req.body?.volume;
        if (typeof volume !== 'number' || !Number.isInteger(volume) || volume < 0 || volume > 100) {
            res.status(400).json({ error: 'invalid_volume' });
            return;
        }
        await (res.locals.player as BasePlayer).setVolume(volume);
        res.json({ ok: true, volume });
    });

    app.post('/v1/next', requirePlayer, async (_req, res) => {
        if (!await (res.locals.player as BasePlayer).nextItem()) {
            res.status(409).json({ error: 'no_next_item' });
            return;
        }
        res.json({ ok: true });
    });

    if (library) {
        app.get('/v1/search', async (req, res) => {
            const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
            if (!q || q.length > 50) throw new MediaHttpError(400, 'invalid_query');
            res.json({ items: await library.search(q) });
        });

        for (const route of ['seasons', 'episodes'] as const) {
            app.get('/v1/' + route, async (req, res) => {
                const id = req.query.itemGuid;
                if (typeof id !== 'string' || !isItemGuid(id)) {
                    throw new MediaHttpError(400, 'invalid_item_guid');
                }
                res.json({ items: await library[route](id) });
            });
        }

        app.post('/v1/play', express.json({ limit: '1kb' }), async (req, res) => {
            const id: unknown = req.body?.itemGuid;
            if (typeof id !== 'string' || !isItemGuid(id)) {
                throw new MediaHttpError(400, 'invalid_item_guid');
            }
            await library.play(id);
            res.json({ ok: true, itemGuid: id });
        });
    }

    app.use((_req, res) => {
        res.status(404).json({ error: 'not_found' });
    });
    const handleError: express.ErrorRequestHandler = (error, _req, res, _next) => {
        if (error instanceof MediaHttpError) {
            res.status(error.status).json({ error: error.code });
            return;
        }
        const clientError = error.status === 400 || error.status === 413;
        res.status(clientError ? error.status : 503)
            .json({ error: clientError ? 'invalid_body' : 'player_unavailable' });
    };
    app.use(handleError);

    return createServer({ requestTimeout: 10000, headersTimeout: 5000 }, app);
}
