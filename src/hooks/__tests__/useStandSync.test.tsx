import _React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStandSync } from '../use-stand-sync';
import { useStandStore } from '@/store/standStore';

// We'll mock socket.io-client
type SocketHandler = (...args: unknown[]) => void;
let handlers: Record<string, SocketHandler> = {};
const fakeSocket = {
  on: (event: string, cb: (...args: any[]) => void) => {
    handlers[event] = cb;
  },
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
};

vi.mock('socket.io-client', () => {
  return {
    io: () => fakeSocket,
  };
});

describe('useStandSync', () => {
  beforeEach(() => {
    handlers = {};
    fakeSocket.emit.mockClear();
    useStandStore.getState().reset();
  });

  it('receives roster and presence messages and updates store', async () => {
    const { result: _result, waitForNextUpdate: _waitForNextUpdate } = renderHook(() =>
      useStandSync({
        eventId: 'evt1',
        userId: 'usr1',
        // onAnnotation should not perform network calls during tests; just write directly
        onAnnotation: (msg) => {
          const d = msg.data as any;
          const key = `${d.musicId}-${d.page}`;
          useStandStore.setState((s) => {
            const layerKey = d.layer.toLowerCase();
            s.annotations[layerKey][key] = [
              ...(s.annotations[layerKey][key] || []),
              {
                id: d.id,
                pieceId: d.musicId,
                pageNumber: d.page,
                x: d.x,
                y: d.y,
                content: d.content,
                color: d.color,
                layer: d.layer,
                createdAt: new Date(d.createdAt),
              },
            ];
            return s;
          });
        },
      })
    );

    // ensure socket listeners registered
    await waitFor(() => {
      expect(typeof handlers['roster']).toBe('function');
    });

    // simulate initial roster message
    act(() => {
      handlers['roster']({ type: 'roster', members: [{ userId: 'a', name: 'Alpha', joinedAt: 't' }] });
    });

    expect(useStandStore.getState().roster).toEqual([{ userId: 'a', name: 'Alpha', section: undefined, joinedAt: 't' }]);

    // simulate presence join
    act(() => {
      handlers['message']({ type: 'presence', userId: 'b', name: 'Beta', status: 'joined' });
    });

    expect(useStandStore.getState().roster).toEqual([
      { userId: 'a', name: 'Alpha', section: undefined, joinedAt: 't' },
      { userId: 'b', name: 'Beta', section: undefined, joinedAt: expect.any(String) },
    ]);

    // simulate leave
    act(() => {
      handlers['message']({ type: 'presence', userId: 'a', name: 'Alpha', status: 'left' });
    });

    expect(useStandStore.getState().roster.map((m) => m.userId)).toEqual(['b']);

    // simulate receiving annotation message and ensure custom handler updates store via callback
    act(() => {
      handlers['message']({
        type: 'annotation',
        data: {
          id: 'ann1',
          musicId: 'piece-1',
          page: 1,
          x: 0.1,
          y: 0.2,
          content: 'Test',
          color: '#123456',
          layer: 'PERSONAL',
          createdAt: new Date().toISOString(),
        },
      });
    });

    // since onAnnotation provided above adds to store manually, check store now has annotation
    const key = 'piece-1-1';
    const anns = useStandStore.getState().annotations.personal[key];
    expect(anns && anns.length).toBe(1);
    expect(anns![0].id).toBe('ann1');
  });
});
