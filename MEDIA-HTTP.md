# Local media control

On Windows, set `FNTV_MEDIA_HTTP_TOKEN` to a random 32-byte value encoded as 64 hexadecimal characters before launching the client. The service is disabled by default and listens on `http://127.0.0.1:18473` when enabled. Send `Authorization: Bearer <token>` on every request.

- `GET /v1/status` returns `state` and, for active MPV playback, the item ID, title, episode and season numbers, elapsed time and duration in seconds, and volume.
- `POST /v1/pause` and `POST /v1/resume` set the pause state.
- `POST /v1/volume` accepts a JSON body such as `{"volume":30}` with an integer from 0 to 100.
- `POST /v1/next` advances to the next entry in the current MPV playlist.

Commands return `409` without active MPV playback, and next also returns `409` at the end of the playlist. An invalid or missing token returns `401`. Start playback from the desktop client before calling commands. The API is available to a future assistant adapter on the same PC.

## Search and start playback

1. `GET /v1/search?q=<URL-encoded title>` returns matching movies and series in `items`.
2. For a series, pass its `itemGuid` to `GET /v1/seasons?itemGuid=<series-guid>`. Select the desired `seasonNumber`, then pass that season's `itemGuid` to `GET /v1/episodes?itemGuid=<season-guid>` and select the desired `episodeNumber`.
3. Send `POST /v1/play` with JSON `{"itemGuid":"<movie-or-episode-guid>"}`. This uses the same playlist and saved playback position as the desktop client. Check `/v1/status` for the current item and playback state.

If MPV is already playing or starting, `/v1/play` returns `409 player_busy`. Close the existing player before opening another title through the API. A NAS login is required.
