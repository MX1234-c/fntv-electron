import { app } from 'electron';

const TRAY_STARTUP_FLAG = '--fntv-start-in-tray';

export function isTrayStartup(args: readonly string[]): boolean {
    return process.platform === 'win32' && args.includes(TRAY_STARTUP_FLAG);
}

export function getLoginStartupOptions() {
    return {
        name: app.isPackaged ? 'FNTV.LocalMedia' : 'FNTV.LocalMedia.Dev',
        path: process.execPath,
        args: app.isPackaged ? [TRAY_STARTUP_FLAG] : [app.getAppPath(), TRAY_STARTUP_FLAG],
    };
}
