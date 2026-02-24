import { act } from '@testing-library/react';
import { useStandStore, Annotation, Tool } from '../standStore';

describe('annotation store actions', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
    global.fetch = vi.fn();
  });

  it('setLayer changes selected layer', () => {
    act(() => {
      useStandStore.getState().setLayer('SECTION');
    });
    expect(useStandStore.getState().selectedLayer).toBe('SECTION');
  });

  it('setEditMode and toggleEditMode work', () => {
    act(() => {
      useStandStore.getState().setEditMode(true);
    });
    expect(useStandStore.getState().editMode).toBe(true);
    act(() => {
      useStandStore.getState().toggleEditMode();
    });
    expect(useStandStore.getState().editMode).toBe(false);
  });

  // Tool state tests
  it('setCurrentTool changes current tool', () => {
    act(() => {
      useStandStore.getState().setCurrentTool(Tool.HIGHLIGHTER);
    });
    expect(useStandStore.getState().currentTool).toBe(Tool.HIGHLIGHTER);
  });

  it('setToolColor changes tool color', () => {
    act(() => {
      useStandStore.getState().setToolColor('#00ff00');
    });
    expect(useStandStore.getState().toolColor).toBe('#00ff00');
  });

  it('setStrokeWidth changes stroke width with clamping', () => {
    act(() => {
      useStandStore.getState().setStrokeWidth(10);
    });
    expect(useStandStore.getState().strokeWidth).toBe(10);

    // Test clamping to max 50
    act(() => {
      useStandStore.getState().setStrokeWidth(100);
    });
    expect(useStandStore.getState().strokeWidth).toBe(50);

    // Test clamping to min 1
    act(() => {
      useStandStore.getState().setStrokeWidth(-5);
    });
    expect(useStandStore.getState().strokeWidth).toBe(1);
  });

  it('setPressureScale changes pressure scale with clamping', () => {
    act(() => {
      useStandStore.getState().setPressureScale(10);
    });
    expect(useStandStore.getState().pressureScale).toBe(10);

    // Test clamping to max 20
    act(() => {
      useStandStore.getState().setPressureScale(50);
    });
    expect(useStandStore.getState().pressureScale).toBe(20);

    // Test clamping to min 0
    act(() => {
      useStandStore.getState().setPressureScale(-5);
    });
    expect(useStandStore.getState().pressureScale).toBe(0);
  });

  it('default tool state is correct', () => {
    useStandStore.getState().reset();
    expect(useStandStore.getState().currentTool).toBe(Tool.PENCIL);
    expect(useStandStore.getState().toolColor).toBe('#ff0000');
    expect(useStandStore.getState().strokeWidth).toBe(3);
    expect(useStandStore.getState().pressureScale).toBe(5);
  });

  it('loadAnnotations fetches and populates state', async () => {
    const fakeAnn = {
      id: 'a1',
      musicId: 'p1',
      page: 2,
      layer: 'PERSONAL',
      strokeData: { x: 0, y: 0, content: 'c', color: '#000' },
      createdAt: new Date().toISOString(),
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ annotations: [fakeAnn] }),
    });

    // set selected layer PERSONAL
    act(() => {
      useStandStore.getState().setLayer('PERSONAL');
    });
    await act(async () => {
      await useStandStore.getState().loadAnnotations('p1', 2);
    });
    const key = 'p1-2';
    const anns = useStandStore.getState().annotations.personal[key];
    expect(anns).toHaveLength(1);
    expect(anns![0].id).toBe('a1');
  });

  it('addAnnotation posts to API and updates state', async () => {
    const ann: Annotation = {
      id: 'temp',
      pieceId: 'p2',
      pageNumber: 1,
      x: 0.3,
      y: 0.4,
      content: 'hi',
      color: '#fff',
      layer: 'SECTION',
      createdAt: new Date(),
    };
    const saved = { ...ann, id: 'saved1', page: ann.pageNumber, strokeData: { x: ann.x, y: ann.y, content: ann.content, color: ann.color } };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ annotation: saved }),
    });
    act(() => {
      useStandStore.getState().setLayer('SECTION');
    });
    await act(async () => {
      await useStandStore.getState().addAnnotation(ann);
    });
    const sectionMap = useStandStore.getState().annotations.section;
    const entries = Object.values(sectionMap).flat();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('saved1');
  });

  it('updateAnnotation moves between layers if layer changed', async () => {
    const ann: Annotation = {
      id: 'orig',
      pieceId: 'p3',
      pageNumber: 1,
      x: 0,
      y: 0,
      content: 'c',
      color: '#000',
      layer: 'PERSONAL',
      createdAt: new Date(),
    };
    // preload into personal slot
    act(() => {
      useStandStore.setState((s) => {
        s.annotations.personal['p3-1'] = [ann];
        return s;
      });
    });
    const saved = { ...ann, id: 'orig', layer: 'SECTION', strokeData: { ...ann } };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ annotation: saved }),
    });
    await act(async () => {
      await useStandStore.getState().updateAnnotation({ ...ann, layer: 'SECTION' });
    });
    expect(useStandStore.getState().annotations.personal['p3-1']).toEqual([]);
    const secArr = useStandStore.getState().annotations.section['p3-1'];
    expect(secArr).toBeDefined();
    expect(secArr).toHaveLength(1);
    expect(secArr![0].layer).toBe('SECTION');
  });

  it('deleteAnnotation removes from all layers', async () => {
    // manually insert into state
    act(() => {
      useStandStore.setState((s) => {
        s.annotations.personal['k'] = [{ id: 'x', pieceId: 'p', pageNumber: 1, x:0,y:0,content:'',color:'',layer:'PERSONAL',createdAt:new Date() }];
        s.annotations.section['k'] = [{ id: 'x', pieceId: 'p', pageNumber: 1, x:0,y:0,content:'',color:'',layer:'SECTION',createdAt:new Date() }];
        return s;
      });
    });
    (global.fetch as any).mockResolvedValue({ ok: true });
    await act(async () => {
      await useStandStore.getState().deleteAnnotation('x');
    });
    expect(useStandStore.getState().annotations.personal['k'] || []).toEqual([]);
    expect(useStandStore.getState().annotations.section['k'] || []).toEqual([]);
  });
});
