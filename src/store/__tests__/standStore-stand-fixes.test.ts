import { act } from '@testing-library/react';
import { useStandStore } from '../standStore';

describe('standStore – stand fixes', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
  });

  // ───────── setAnnotations ─────────
  describe('setAnnotations', () => {
    const makeAnnotation = (overrides: Record<string, unknown> = {}) => ({
      id: 'a1',
      pieceId: 'piece-1',
      pageNumber: 1,
      layer: 'PERSONAL' as const,
      strokeData: { strokes: [{ x: 0, y: 0 }] },
      userId: 'u1',
      sectionId: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      ...overrides,
    });

    it('groups annotations by layer and piece-page key', () => {
      const a1 = makeAnnotation({ id: 'a1', layer: 'PERSONAL', pageNumber: 1 });
      const a2 = makeAnnotation({ id: 'a2', layer: 'PERSONAL', pageNumber: 2 });
      const a3 = makeAnnotation({ id: 'a3', layer: 'DIRECTOR' });

      act(() => {
        useStandStore.getState().setAnnotations([a1, a2, a3]);
      });

      const state = useStandStore.getState();
      // personal layer (lowercase key) should have two keys
      expect(state.annotations.personal).toBeDefined();
      expect(state.annotations.personal['piece-1-1']).toEqual([a1]);
      expect(state.annotations.personal['piece-1-2']).toEqual([a2]);
      // director layer
      expect(state.annotations.director).toBeDefined();
      expect(state.annotations.director['piece-1-1']).toEqual([a3]);
    });

    it('replaces previous annotations on call', () => {
      const a1 = makeAnnotation({ id: 'a1' });
      act(() => {
        useStandStore.getState().setAnnotations([a1]);
      });
      expect(useStandStore.getState().annotations.personal['piece-1-1']).toHaveLength(1);

      const a2 = makeAnnotation({ id: 'a2', layer: 'DIRECTOR' });
      act(() => {
        useStandStore.getState().setAnnotations([a2]);
      });
      // personal should now be empty object, director should have entry
      expect(Object.keys(useStandStore.getState().annotations.personal)).toHaveLength(0);
      expect(useStandStore.getState().annotations.director['piece-1-1']).toEqual([a2]);
    });
  });

  // ───────── setNavigationLinks ─────────
  describe('setNavigationLinks', () => {
    it('replaces navigation links', () => {
      const links = [
        {
          id: 'nl1',
          fromPieceId: 'piece-1',
          fromPage: 1,
          toPieceId: 'piece-1',
          toPage: 5,
          toMusicId: null,
          label: 'DS al Coda',
        },
      ];
      act(() => {
        useStandStore.getState().setNavigationLinks(links as any);
      });
      expect(useStandStore.getState().navigationLinks).toEqual(links);
    });
  });

  // ───────── setUserContext ─────────
  describe('setUserContext', () => {
    it('stores user context', () => {
      const ctx = {
        userId: 'u1',
        roles: ['MUSICIAN', 'SECTION_LEADER'],
        isDirector: false,
        isSectionLeader: true,
        userSectionIds: ['s1'],
      };
      act(() => {
        useStandStore.getState().setUserContext(ctx);
      });
      expect(useStandStore.getState().userContext).toEqual(ctx);
    });

    it('defaults to null', () => {
      expect(useStandStore.getState().userContext).toBeNull();
    });
  });

  // ───────── updatePieceTotalPages ─────────
  describe('updatePieceTotalPages', () => {
    it('updates totalPages for the matching piece', () => {
      act(() => {
        useStandStore.getState().setPieces([
          { id: 'p1', title: 'March', pdfUrl: '/f', totalPages: 1 },
          { id: 'p2', title: 'Waltz', pdfUrl: '/g', totalPages: 1 },
        ] as any);
      });

      act(() => {
        useStandStore.getState().updatePieceTotalPages('p1', 12);
      });

      const pieces = useStandStore.getState().pieces;
      expect(pieces.find((p) => p.id === 'p1')?.totalPages).toBe(12);
      expect(pieces.find((p) => p.id === 'p2')?.totalPages).toBe(1);
    });
  });

  // ───────── updateNavigationLink ─────────
  describe('updateNavigationLink', () => {
    it('updates an existing link by id', () => {
      const link = {
        id: 'nl1',
        fromPieceId: 'p1',
        fromPage: 1,
        toPieceId: 'p1',
        toPage: 3,
        toMusicId: null,
        label: 'Old',
      };

      act(() => {
        useStandStore.getState().setNavigationLinks([link] as any);
      });

      act(() => {
        useStandStore
          .getState()
          .updateNavigationLink({ ...link, label: 'New' } as any);
      });

      const updated = useStandStore.getState().navigationLinks;
      expect(updated).toHaveLength(1);
      expect(updated[0].label).toBe('New');
    });

    it('does not modify links if id not found', () => {
      const existing = {
        id: 'nl1',
        fromPieceId: 'p1',
        fromPage: 1,
        toPieceId: 'p1',
        toPage: 3,
        toMusicId: null,
        label: 'Keep',
      };
      act(() => {
        useStandStore.getState().setNavigationLinks([existing] as any);
      });

      act(() => {
        useStandStore.getState().updateNavigationLink({
          id: 'unknown',
          fromPieceId: 'p1',
          fromPage: 1,
          toPieceId: 'p1',
          toPage: 2,
          toMusicId: null,
          label: 'Nope',
        } as any);
      });

      // Should still just have the original
      expect(useStandStore.getState().navigationLinks).toHaveLength(1);
      expect(useStandStore.getState().navigationLinks[0].label).toBe('Keep');
    });
  });

  // ───────── addAnnotation with strokeData ─────────
  describe('addAnnotation', () => {
    it('adds annotation with strokeData via API mock', async () => {
      const savedAnnotation = {
        id: 'ann1',
        musicId: 'piece-1',
        page: 1,
        layer: 'PERSONAL',
        strokeData: { paths: [[0, 0, 1, 1]] },
        userId: 'u1',
        sectionId: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ annotation: savedAnnotation }),
      } as any);

      await act(async () => {
        await useStandStore.getState().addAnnotation({
          id: '',
          pieceId: 'piece-1',
          pageNumber: 1,
          layer: 'PERSONAL',
          strokeData: { paths: [[0, 0, 1, 1]] },
          userId: 'u1',
          sectionId: null,
          createdAt: '',
          updatedAt: '',
        });
      });

      const stored = useStandStore.getState().annotations.personal?.['piece-1-1'];
      expect(stored).toBeDefined();
      expect(stored).toHaveLength(1);
      expect(stored![0].strokeData).toEqual({ paths: [[0, 0, 1, 1]] });

      fetchSpy.mockRestore();
    });
  });
});
