import { useEffect, useRef, useCallback, useState } from 'react';
import { useStandStore } from '@/store/standStore';
import { io as socketIoClient, type Socket } from 'socket.io-client';
const isDev = process.env.NODE_ENV !== "production";

// =============================================================================
// TYPES
// =============================================================================

export interface StandRosterMember {
  userId: string;
  name: string;
  section?: string;
  joinedAt: string;
}

export interface StandState {
  eventId: string;
  currentPage?: number;
  currentPieceIndex?: number;
  nightMode?: boolean;
  lastUpdated?: string;
}

export type StandMessageType =
  | 'presence'
  | 'command'
  | 'mode'
  | 'annotation'
  | 'state'
  | 'roster';

export interface PresenceMessage {
  type: 'presence';
  userId: string;
  name: string;
  section?: string;
  status: 'joined' | 'left';
}

export interface CommandMessage {
  type: 'command';
  action: 'setPage' | 'setPiece' | 'toggleNightMode';
  page?: number;
  pieceIndex?: number;
  value?: boolean;
}

export interface ModeMessage {
  type: 'mode';
  name: string;
  value: unknown;
}

export interface AnnotationMessage {
  type: 'annotation';
  data: Record<string, unknown>;
}

export interface StateMessage {
  type: 'state';
  eventId: string;
  currentPage?: number;
  currentPieceIndex?: number;
  nightMode?: boolean;
}

export interface RosterMessage {
  type: 'roster';
  members: StandRosterMember[];
}

export type StandMessage =
  | PresenceMessage
  | CommandMessage
  | ModeMessage
  | AnnotationMessage
  | StateMessage
  | RosterMessage;

export interface UseStandSyncOptions {
  eventId: string;
  userId: string;
  onStateChange?: (state: StandState) => void;
  onRosterChange?: (roster: StandRosterMember[]) => void;
  onPresenceChange?: (presence: PresenceMessage) => void;
  onCommand?: (command: CommandMessage) => void;
  onModeChange?: (mode: ModeMessage) => void;
  onAnnotation?: (annotation: AnnotationMessage) => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pollingInterval?: number;
}

export interface UseStandSyncReturn {
  isConnected: boolean;
  connectionError: Error | null;
  roster: StandRosterMember[];
  currentState: StandState | null;
  sendCommand: (command: Omit<CommandMessage, 'type'>) => void;
  sendMode: (name: string, value: unknown) => void;
  sendAnnotation: (data: Record<string, unknown>) => void;
  reconnect: () => void;
  disconnect: () => void;
  isPollingFallback: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_RECONNECT_INTERVAL = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_POLLING_INTERVAL = 5000; // 5 seconds for polling fallback
const SOCKET_PATH = '/api/stand/socket';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if WebSocket is available
 */
function isWebSocketAvailable(): boolean {
  return typeof WebSocket !== 'undefined' || typeof window !== 'undefined';
}

/**
 * Check if Socket.IO is likely to work
 */
function canUseSocketIO(): boolean {
  return typeof window !== 'undefined';
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for real-time stand synchronization via WebSocket
 * Falls back to polling when WebSocket is unavailable
 *
 * @param eventId - The event ID to sync with
 * @param userId - The current user's ID
 * @param callbacks - Optional callbacks for different message types
 */
export function useStandSync({
  eventId,
  userId,
  onStateChange,
  onRosterChange,
  onPresenceChange,
  onCommand,
  onModeChange,
  onAnnotation,
  onError,
  reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
  maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
  pollingInterval = DEFAULT_POLLING_INTERVAL,
}: UseStandSyncOptions): UseStandSyncReturn {
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const [roster, setRoster] = useState<StandRosterMember[]>([]);
  const [currentState, setCurrentState] = useState<StandState | null>(null);
  const [isPollingFallback, setIsPollingFallback] = useState(false);

  // Refs to break circular dependencies
  const connectRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});

  // =============================================================================
  // POLLING FALLBACK
  // =============================================================================

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch(`/api/stand/sync?eventId=${eventId}`);
      if (response.ok) {
        const data = await response.json();

        // Build StandState from the flat response
        const state: StandState = {
          eventId: data.eventId ?? eventId,
          currentPage: data.currentPage,
          currentPieceIndex: data.currentPieceIndex,
          nightMode: data.nightMode,
          lastUpdated: data.lastSyncAt,
        };
        setCurrentState(state);
        onStateChange?.(state);

        // Build roster from activeUserList
        if (data.activeUserList) {
          const rosterMembers: StandRosterMember[] = data.activeUserList.map(
            (u: { userId: string; name: string; section?: string }) => ({
              userId: u.userId,
              name: u.name,
              section: u.section,
              joinedAt: new Date().toISOString(),
            })
          );
          setRoster(rosterMembers);
          onRosterChange?.(rosterMembers);
          useStandStore.getState().setRoster(rosterMembers);
        }

        setIsConnected(true);
        setConnectionError(null);
      }
    } catch (error) {
      if (isDev) console.error('[useStandSync] Polling error:', error);
    }
  }, [eventId, onStateChange, onRosterChange]);

  const startPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    setIsPollingFallback(true);
    if (isDev) console.log('[useStandSync] Starting polling fallback - WebSocket unavailable');

    // Send join presence so server tracks us
    fetch('/api/stand/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, presence: { type: 'presence', status: 'joined' } }),
    }).catch(() => {/* ignore */});

    // Initial fetch
    fetchState();

    // Set up polling interval
    pollingIntervalRef.current = setInterval(fetchState, pollingInterval);
  }, [eventId, fetchState, pollingInterval]);

  const stopPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPollingFallback(false);
  }, []);

  // =============================================================================
  // WEBSOCKET CONNECTION
  // =============================================================================

  // Schedule reconnection attempt
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectAttemptsRef.current += 1;
    if (isDev) console.log(
      `[useStandSync] Scheduling reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`
    );

    reconnectTimeoutRef.current = setTimeout(() => {
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        connectRef.current();
      } else {
        setConnectionError(new Error('Max reconnection attempts reached'));
        startPollingFallback();
      }
    }, reconnectInterval);
  }, [reconnectInterval, maxReconnectAttempts, startPollingFallback]);

  const connect = useCallback(() => {
    // Check if WebSocket is available
    if (!isWebSocketAvailable() || !canUseSocketIO()) {
      if (isDev) console.warn('[useStandSync] WebSocket not available, using polling fallback');
      startPollingFallback();
      return;
    }

    if (socketRef.current?.connected) {
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    try {
      const socket = socketIoClient(socketUrl as string, {
        path: SOCKET_PATH,
        query: {
          eventId,
          userId,
        },
        transports: ['websocket', 'polling'],
        reconnection: false, // We handle reconnection manually
        timeout: 10000,
      });

      socket.on('connect', () => {
        if (isDev) console.log('[useStandSync] Connected to stand sync server');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttemptsRef.current = 0;
        stopPollingFallback();
      });

      socket.on('disconnect', (reason) => {
        if (isDev) console.log('[useStandSync] Disconnected:', reason);
        setIsConnected(false);

        // Attempt reconnection if not manually disconnected
        if (reason !== 'io client disconnect' && reconnectAttemptsRef.current < maxReconnectAttempts) {
          scheduleReconnectRef.current();
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          // Fall back to polling after max reconnect attempts
          startPollingFallback();
        }
      });

      socket.on('connect_error', (error) => {
        if (isDev) console.error('[useStandSync] Connection error:', error);
        setConnectionError(new Error(error.message));
        setIsConnected(false);
        
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          scheduleReconnectRef.current();
        } else {
          // Fall back to polling
          startPollingFallback();
        }
      });

      socket.on('error', (error: { message: string }) => {
        if (isDev) console.error('[useStandSync] Socket error:', error);
        onError?.(new Error(error.message));
      });

      // Handle state messages
      socket.on('state', (state: StateMessage) => {
        setCurrentState(state);
        onStateChange?.(state);
      });

      // Handle roster messages
      socket.on('roster', (data: RosterMessage) => {
        setRoster(data.members);
        onRosterChange?.(data.members);
        // mirror to global store
        useStandStore.getState().setRoster(data.members);
      });

      // Handle generic messages
      socket.on('message', (message: StandMessage) => {
        switch (message.type) {
          case 'presence':
            // Update roster based on presence
            if (message.status === 'joined') {
              setRoster((prev) => {
                if (prev.some((m) => m.userId === message.userId)) {
                  return prev;
                }
                const newList = [
                  ...prev,
                  {
                    userId: message.userId,
                    name: message.name,
                    section: message.section,
                    joinedAt: new Date().toISOString(),
                  },
                ];
                // update global store as well
                useStandStore.getState().addRosterEntry({
                  userId: message.userId,
                  name: message.name,
                  section: message.section,
                  joinedAt: new Date().toISOString(),
                });
                return newList;
              });
            } else {
              setRoster((prev) => prev.filter((m) => m.userId !== message.userId));
              useStandStore.getState().removeRosterEntry(message.userId);
            }
            onPresenceChange?.(message);
            break;

          case 'command':
            onCommand?.(message);
            break;

          case 'mode':
            onModeChange?.(message);
            break;

          case 'annotation':
            onAnnotation?.(message);
            break;
        }
      });

      socketRef.current = socket;
    } catch (error) {
      if (isDev) console.error('[useStandSync] Failed to create socket:', error);
      setConnectionError(error as Error);
      startPollingFallback();
    }
  }, [eventId, userId, onStateChange, onRosterChange, onPresenceChange, onCommand, onModeChange, onAnnotation, onError, maxReconnectAttempts, startPollingFallback, stopPollingFallback]);

  // Update refs to avoid circular dependencies
  connectRef.current = connect;
  scheduleReconnectRef.current = scheduleReconnect;

  // Send command message
  const sendCommand = useCallback(
    (command: Omit<CommandMessage, 'type'>) => {
      if (isPollingFallback) {
        // Use the main sync endpoint with command payload
        fetch('/api/stand/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, command: { type: 'command', ...command } }),
        }).catch((err) => { if (isDev) console.error('[useStandSync] Failed to send command:', err); });
        return;
      }

      if (!socketRef.current?.connected) {
        if (isDev) console.warn('[useStandSync] Cannot send command: not connected');
        return;
      }

      socketRef.current.emit('message', {
        type: 'command',
        ...command,
      });
    },
    [eventId, isPollingFallback]
  );

  // Send mode message
  const sendMode = useCallback(
    (name: string, value: unknown) => {
      if (isPollingFallback) {
        // Use the main sync endpoint for mode changes
        fetch('/api/stand/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            command: { type: 'command', action: 'toggleNightMode', value: name === 'nightMode' ? value : undefined },
          }),
        }).catch((err) => { if (isDev) console.error('[useStandSync] Failed to send mode:', err); });
        return;
      }

      if (!socketRef.current?.connected) {
        if (isDev) console.warn('[useStandSync] Cannot send mode: not connected');
        return;
      }

      socketRef.current.emit('message', {
        type: 'mode',
        name,
        value,
      });
    },
    [eventId, isPollingFallback]
  );

  // Send annotation message
  const sendAnnotation = useCallback(
    (data: Record<string, unknown>) => {
      if (isPollingFallback) {
        // Annotations are handled by the annotation API directly
        return;
      }

      if (!socketRef.current?.connected) {
        if (isDev) console.warn('[useStandSync] Cannot send annotation: not connected');
        return;
      }

      socketRef.current.emit('message', {
        type: 'annotation',
        data,
      });
    },
    [isPollingFallback]
  );

  // Manual reconnect
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    stopPollingFallback();
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    connect();
  }, [connect, stopPollingFallback]);

  // Manual disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    stopPollingFallback();
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent auto-reconnect

    if (socketRef.current) {
      // Send leave presence
      socketRef.current.emit('message', {
        type: 'presence',
        userId,
        name: '',
        status: 'left',
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsConnected(false);
    setRoster([]);
    setCurrentState(null);
  }, [userId, maxReconnectAttempts, stopPollingFallback]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      stopPollingFallback();

      if (socketRef.current) {
        // Send leave presence before disconnecting
        socketRef.current.emit('message', {
          type: 'presence',
          userId,
          name: '',
          status: 'left',
        });
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      setIsConnected(false);
    };
  }, [eventId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    connectionError,
    roster,
    currentState,
    sendCommand,
    sendMode,
    sendAnnotation,
    reconnect,
    disconnect,
    isPollingFallback,
  };
}
