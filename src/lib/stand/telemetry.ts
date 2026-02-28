/**
 * Stand Telemetry — lightweight event logging for operations analytics.
 *
 * Records structured events to the server log (and optionally a DB table
 * in the future). All events are fire-and-forget; telemetry never blocks
 * the request.
 */

type TelemetryEvent =
  | 'stand.file.access'
  | 'stand.file.denied'
  | 'stand.annotation.create'
  | 'stand.annotation.delete'
  | 'stand.sync.poll'
  | 'stand.sync.ws'
  | 'stand.session.start'
  | 'stand.session.end'
  | 'stand.error'
  | 'stand.settings.update'
  | 'stand.nav.create'
  | 'stand.nav.delete'
  | 'stand.practice.log'
  | 'stand.export'
  | 'stand.bookmark.create';

interface TelemetryPayload {
  event: TelemetryEvent;
  userId?: string;
  eventId?: string;
  pieceId?: string;
  meta?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Record a telemetry event. Fire-and-forget — never throws.
 */
export function recordTelemetry(payload: TelemetryPayload): void {
  try {
    const entry = {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    };

    // Structured logging — parseable by log aggregators
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify({ level: 'info', ...entry }));
    } else {
      console.debug(`[telemetry] ${entry.event}`, entry);
    }
  } catch {
    // Telemetry must never break the app
  }
}
