# Windows 媒体控制 API

本接口由 Windows 客户端提供，控制该客户端启动的 MPV 播放器，并使用客户端当前登录的飞牛账号查询片库。使用前先安装包含 HTTP 功能的改版，登录自己的飞牛 NAS，确认手动播放正常。

## 1. 开启接口

在 PowerShell 中生成自己的令牌并保存为 Windows 用户环境变量。令牌需要是 64 个十六进制字符。下面的命令每次执行都会生成新令牌，已经配置好的调用端也需要同步更新。

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$token = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
[Environment]::SetEnvironmentVariable('FNTV_MEDIA_HTTP_TOKEN', $token, 'User')
```

默认只监听本机 `127.0.0.1:18473`。配置完成后从托盘完全退出客户端，再重新打开。若客户端仍读取不到新配置，注销并重新登录 Windows，让桌面启动进程刷新环境变量。

在新的 PowerShell 窗口中验证。返回 `{"state":"idle"}` 表示接口已连通，目前没有活动的 MPV 播放。

```powershell
$base = 'http://127.0.0.1:18473/v1'
$token = [Environment]::GetEnvironmentVariable('FNTV_MEDIA_HTTP_TOKEN', 'User')
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod "$base/status" -Headers $headers
```

所有接口都要求 `Authorization: Bearer <你的令牌>`。有请求体的接口发送 `Content-Type: application/json`。令牌与飞牛账号密码独立。

## 2. 允许局域网设备访问

小智等设备需要访问电脑的局域网地址。在电脑上运行 `ipconfig` 找到当前 IPv4，然后把下面的示例 IP 替换成自己的电脑 IP。这里填电脑地址。

```powershell
[Environment]::SetEnvironmentVariable('FNTV_MEDIA_HTTP_HOST', '192.168.1.100', 'User')
```

客户端支持绑定具体的 `10.*`、`172.16.*～172.31.*` 或 `192.168.*` 私网 IPv4。无效值会回退到本机地址。完全退出客户端后重新打开，必要时注销 Windows。外部调用端使用 `http://电脑IP:18473/v1` 和相同令牌。

在 Windows 防火墙中允许私有网络的入站 TCP 18473，按需把来源限制为调用设备 IP。此接口使用 HTTP，适用于受信任的本机或局域网。共享代码和截图时请隐藏令牌，公开固件前也要移除内置令牌。

恢复仅本机访问后重启客户端。

```powershell
[Environment]::SetEnvironmentVariable('FNTV_MEDIA_HTTP_HOST', $null, 'User')
```

## 3. 接口清单

所有路径均相对于上面的 `$base`，时间单位为秒，音量范围为 0～100。

- `GET /status` 查询播放状态。
- `GET /catalog?page=1` 浏览片库，每页最多 8 项，默认第一页，页码范围 1～10000。返回 `page`、`total` 和 `items`。
- `GET /search?q=片名` 搜索电影和电视剧。搜索词去除首尾空白后长度为 1～50，中文及特殊字符需要 URL 编码。返回 `items`。
- `GET /seasons?itemGuid=电视剧ID` 获取季列表，返回 `items`。
- `GET /episodes?itemGuid=季ID` 获取该季剧集，返回 `items`。
- `POST /play`，请求体 `{"itemGuid":"电影或单集ID"}`。沿用客户端播放列表和飞牛保存的续播位置。正在播放时会准备新影片、关闭旧播放器并回传最终进度，然后开播。启动或切换尚未结束时返回 `409 player_busy`。
- `POST /pause` 暂停，无需请求体。
- `POST /resume` 恢复暂停，无需请求体。
- `POST /volume`，请求体 `{"volume":30}`，音量必须为整数。
- `POST /next` 播放当前队列的下一项，末项返回 `409 no_next_item`。
- `POST /seek`，请求体 `{"mode":"relative","seconds":30}` 快进 30 秒；负数回退。用 `{"mode":"absolute","seconds":1200}` 跳到 20:00。秒数必须为安全整数，绝对位置须非负。返回 `{"ok":true,"targetSeconds":1200}`，目标限制在当前影片时长内，保留暂停状态。
- `POST /maximize` 恢复窗口、退出全屏、最大化并置顶。
- `POST /minimize` 最小化窗口，播放继续。
- `POST /fullscreen` 恢复窗口并进入全屏。

通常控制成功返回 `{"ok":true}`；设置音量还返回 `volume`，开播还返回 `itemGuid`。开播成功后可轮询 `/status` 确认影片和进度。

活动播放的状态示例，ID 为占位示例。

```json
{
  "state": "playing",
  "itemGuid": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "title": "示例剧 - S1E5: 第五集",
  "seasonNumber": 1,
  "episodeNumber": 5,
  "positionSeconds": 120.5,
  "durationSeconds": 2700,
  "volume": 30
}
```

`state` 可为 `idle`、`loading`、`playing` 或 `paused`。空闲时只返回 `state`。加载过程中部分字段可能为 `null`。启动或切换期间也可能暂时返回 `idle`。

片库、搜索、季和集列表的条目包含 `itemGuid`、`title`、`type`、`tvTitle`、`seasonNumber`、`episodeNumber`、`positionSeconds` 和 `durationSeconds`。电影或单集 ID 用于开播，电视剧 ID 用于查季，季 ID 用于查集。请使用接口返回的 ID。

## 4. 从片库选择并播放

下面示例接在第 1 节的 PowerShell 初始化代码后执行。

先列出有什么可以看，再按片名搜索。

```powershell
$catalog = Invoke-RestMethod "$base/catalog?page=1" -Headers $headers
$catalog.items | Format-Table title, type, itemGuid
$query = [Uri]::EscapeDataString('绝命毒师')
$results = Invoke-RestMethod "$base/search?q=$query" -Headers $headers
$results.items | Format-Table title, type, itemGuid
```

电影搜索结果的 `itemGuid` 可以直接开播。若搜索到多个版本，先根据返回结果选择。

电视剧按“搜索 → 选剧 → 选季 → 选集 → 开播”操作。下面示例只在唯一匹配时开播。

```powershell
$show = @($results.items | Where-Object { $_.title -eq '绝命毒师' -and $_.type -eq 'TV' })
if ($show.Count -ne 1) { throw '请先从搜索结果选择唯一的电视剧' }
$seasons = Invoke-RestMethod "$base/seasons?itemGuid=$($show[0].itemGuid)" -Headers $headers
$season = @($seasons.items | Where-Object seasonNumber -eq 1)
if ($season.Count -ne 1) { throw '没有找到唯一的第一季' }
$episodes = Invoke-RestMethod "$base/episodes?itemGuid=$($season[0].itemGuid)" -Headers $headers
$episode = @($episodes.items | Where-Object episodeNumber -eq 5)
if ($episode.Count -ne 1) { throw '没有找到唯一的第五集' }
$body = @{ itemGuid = $episode[0].itemGuid } | ConvertTo-Json -Compress
Invoke-RestMethod "$base/play" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

暂停、恢复及快进示例。

```powershell
Invoke-RestMethod "$base/pause" -Method Post -Headers $headers
Invoke-RestMethod "$base/resume" -Method Post -Headers $headers
Invoke-RestMethod "$base/seek" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"mode":"relative","seconds":30}'
```

## 5. 自启动与屏幕

右下角隐藏图标区域找到飞牛影视，右键 → 设置 → 勾选“登录 Windows 后启动并隐藏到托盘”。登录 Windows 后主窗口隐藏，接口点播会打开 MPV。通过托盘“显示主窗口”可浏览片库，“退出”会关闭接口。

HTTP 开播会最大化并置顶。开播、继续、最大化和全屏会请求 Windows 点亮因空闲超时关闭的显示器。实际亮屏取决于系统及显示器状态；电脑睡眠、锁屏登录和显示器物理电源需要另行处理。

## 6. 常见问题和错误

错误响应使用 `{"error":"错误码"}`。

- 连接被拒绝或超时，先确认客户端仍在运行，令牌已配置，且监听地址正确。本机调通后再检查局域网防火墙、IP 变化及设备网络。
- `401 unauthorized`，缺少令牌或与客户端不一致。
- `400 invalid_query / invalid_page / invalid_item_guid / invalid_volume / invalid_seek`，检查参数、ID 类型及范围。
- `400 / 413 invalid_body`，检查 JSON 格式和请求体大小，请求体限制为 1 KB。
- `409 nas_login_required`，先在客户端登录自己的飞牛 NAS。
- `409 no_active_player`，当前没有可控制的 MPV，先开播。飞牛内嵌网页播放器无法用这些 MPV 控制接口操作。
- `409 player_busy`，当前开播或切换正在进行，稍后查询状态再操作。
- `409 no_next_item`，已经到当前播放队列最后一项。
- `502 search_failed / season_list_failed / episode_list_failed / catalog_failed / playback_failed`，检查 NAS 连接、登录状态和目标文件是否存在。
- `503 player_unavailable`，播放器暂时无法响应，检查加载状态或重新打开播放器。
- `404 not_found`，检查方法和路径，例如全屏需用 POST。
- 小智回答“没有这个功能”，确认固件实际注册了对应 MCP 工具，且与本 API 使用相同地址和令牌。
- 搜索“片库”返回空结果时，使用 `/catalog` 浏览内容；`/search` 的参数应该是片名。

## 7. 开发与验证

源码使用 TypeScript、Electron 和 MPV。运行 `npm test` 编译并执行仓库测试。Windows 打包还需要 Go，以及项目要求的 `third_party/fntv-mpv` 完整运行组件，构建命令为 `npm run build:win`。

本说明对应当前分支代码。下载时请确认安装包包含所需功能，尤其是局域网、片库浏览和窗口控制。公开修改版时保留 GPL-3.0 许可证和上游归属，并提供与发布安装包对应的源码。

## 8. 局域网自动发现

客户端绑定私网地址且 HTTP 启动成功后，会自动发布 `_fntv-media._tcp.local` mDNS/DNS-SD 服务。本机监听模式不发布。广播包含电脑名称、接口 IPv4、端口、协议版本和鉴权类型，不包含令牌。

更新后的小智固件会在控制前查找服务，唯一匹配时优先使用发现地址，结果缓存约 30 秒。没有找到或发现多台电脑时使用固件中配置的备用地址。令牌仍需预先配置，两端一致。可说“寻找局域网里的飞牛影视”检查发现结果。

设备需要在支持组播的同一局域网。Windows 私有网络需允许 UDP 5353 的 mDNS 通信及 HTTP 入站 TCP 18473。客户端仍绑定指定电脑 IPv4，电脑 IP 改变后应更新 `FNTV_MEDIA_HTTP_HOST` 并重启客户端。当前版本实现服务发现，首次配对和多电脑选择尚未提供。
