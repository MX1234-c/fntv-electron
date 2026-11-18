import { execFile } from 'node:child_process';
import * as log from '../../modules/logger';

const wakeDisplayCommand = `
Add-Type -Namespace Fntv -Name DisplayPower -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'
if ([Fntv.DisplayPower]::SetThreadExecutionState(2) -eq 0) { exit 1 }
`;

export function wakeWindowsDisplay(): void {
    if (process.platform !== 'win32') return;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', wakeDisplayCommand],
        { windowsHide: true, timeout: 5000 }, (error) => {
            if (error) log.warn('Windows 显示器唤醒请求失败:', error.code);
        });
}
