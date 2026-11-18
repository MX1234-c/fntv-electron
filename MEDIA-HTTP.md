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

If MPV is playing, the new item is prepared before the old player is closed and its final progress is sent to the NAS. Concurrent start or switch requests return `409 player_busy`. A NAS login is required.

## Start automatically on Windows

Open the tray menu, choose **设置**, and enable **登录 Windows 后启动并隐藏到托盘**. After Windows sign-in, the app starts in the tray. **显示主窗口** opens the library. An HTTP playback request opens the MPV window while the library stays hidden. Disable the same setting to remove the login startup entry.

For HTTP access after sign-in, save the token as a Windows user environment variable. A token set only in a PowerShell session is available only to programs launched from that session.

## Optional LAN access

Set `FNTV_MEDIA_HTTP_HOST` to the Windows computer's private IPv4 address before launching the client to allow a device on the same LAN to call the API. The same Bearer token is required. Leave the variable unset for loopback-only access. On Windows Firewall, restrict inbound TCP 18473 to the intended device where possible.

## MPV window controls

HTTP playback opens MPV maximized and on top. With MPV open, use `POST /v1/maximize` to restore and maximize the window or `POST /v1/minimize` to hide it to the taskbar while playback continues.

Use `POST /v1/fullscreen` for true full screen. Maximize exits full screen. Play, resume, maximize and full screen also request Windows to wake a display turned off by idle timeout.

Use `POST /v1/seek` with `{"mode":"relative","seconds":30}` to skip ahead, a negative number to go back, or `{"mode":"absolute","seconds":1200}` to jump to 20:00. The response returns the requested position clamped to the media duration as `targetSeconds`. The pause state is preserved.

Use `GET /v1/catalog?page=1` to browse the library without a search term. Each page contains up to eight entries and the response includes the library total. Titles and item IDs can be passed to the existing playback and episode endpoints.
