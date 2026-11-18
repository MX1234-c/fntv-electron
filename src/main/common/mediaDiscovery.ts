import { Bonjour } from 'bonjour-service';
import { hostname } from 'node:os';
import * as log from '../../modules/logger';

export function publishMediaService(address: string): () => void {
    if (address === '127.0.0.1') return () => undefined;
    const bonjour = new Bonjour({}, (error: Error) => log.warn('媒体服务发现不可用:', error.message));
    const service = bonjour.publish({
        name: 'FNTV-' + hostname(),
        type: 'fntv-media',
        protocol: 'tcp',
        port: 18473,
        disableIPv6: true,
        txt: { version: '1', address, path: '/v1', auth: 'bearer' },
    });
    service.on('error', error => log.warn('媒体服务广播失败:', error.message));
    return () => service.stop(() => bonjour.destroy());
}

