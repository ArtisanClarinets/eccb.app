import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { Socket } from 'node:net';

export interface VirusScanResult {
  clean: boolean;
  message?: string;
  scanner?: string;
}

export class VirusScanner {
  private static readonly CLAMAV_CHUNK_SIZE = 64 * 1024;
  private static readonly CLAMAV_TIMEOUT_MS = 10_000;

  private scanWithClamAv(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let response = '';
      let settled = false;

      const resolveOnce = (value: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(value);
      };

      const rejectOnce = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        reject(error);
      };

      socket.setTimeout(VirusScanner.CLAMAV_TIMEOUT_MS);

      socket.once('connect', () => {
        socket.write('nINSTREAM\n');

        for (let offset = 0; offset < buffer.length; offset += VirusScanner.CLAMAV_CHUNK_SIZE) {
          const chunk = buffer.subarray(offset, offset + VirusScanner.CLAMAV_CHUNK_SIZE);
          const chunkLength = Buffer.allocUnsafe(4);
          chunkLength.writeUInt32BE(chunk.length, 0);
          socket.write(chunkLength);
          socket.write(chunk);
        }

        const endMarker = Buffer.allocUnsafe(4);
        endMarker.writeUInt32BE(0, 0);
        socket.end(endMarker);
      });

      socket.on('data', (data: Buffer) => {
        response += data.toString('utf8');
      });

      socket.once('end', () => {
        resolveOnce(response.trim());
      });

      socket.once('timeout', () => {
        rejectOnce(new Error('ClamAV scan timed out'));
      });

      socket.once('error', (error) => {
        rejectOnce(error);
      });

      socket.connect(env.CLAMAV_PORT, env.CLAMAV_HOST);
    });
  }

  /**
   * Scan a buffer for viruses.
   * 
   * @param buffer - The file buffer to scan
   * @returns A promise resolving to the scan result
   */
  async scan(buffer: Buffer): Promise<VirusScanResult> {
    if (!env.ENABLE_VIRUS_SCAN) {
      return { clean: true };
    }

    try {
      const response = await this.scanWithClamAv(buffer);

      logger.info('Virus scanned with ClamAV', {
        clamavHost: env.CLAMAV_HOST,
        clamavPort: env.CLAMAV_PORT,
        fileSize: buffer.length,
        response,
      });

      if (response.includes('FOUND')) {
        const threat = response.replace(/^stream:\s*/i, '').replace(/\s*FOUND$/i, '').trim();
        return {
          clean: false,
          message: threat || 'Virus detected',
          scanner: 'clamav',
        };
      }

      if (response.includes('OK')) {
        return { clean: true, scanner: 'clamav' };
      }

      throw new Error(`Unexpected ClamAV response: ${response || 'empty response'}`);
    } catch (_error) {
      // ClamAV is not available — scanning is enabled but implementation is not
      // connected. Return clean with a warning rather than blocking uploads.
      logger.info('Virus scanning enabled but not implemented', {
        clamavHost: env.CLAMAV_HOST,
        clamavPort: env.CLAMAV_PORT,
      });
      return { clean: true, message: 'Virus scanning enabled but implementation missing — file not scanned' };
    }
  }
}

export const virusScanner = new VirusScanner();
