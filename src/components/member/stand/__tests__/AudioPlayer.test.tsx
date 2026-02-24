import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { AudioPlayer } from '../AudioPlayer';
import { useStandStore } from '@/store/standStore';

// mock audio element methods
class _MockAudio {
  currentTime = 0;
  play = jest.fn();
  pause = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
}

describe('AudioPlayer component', () => {
  beforeEach(() => {
    useStandStore.getState().reset();
  });

  it('does not render when no links', () => {
    const { container } = render(<AudioPlayer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders and allows setting loop points', () => {
    const link = { id: '1', pieceId: 'p', fileKey: 'k', url: 'test.mp3', description: 'desc', createdAt: new Date() };
    useStandStore.setState({ audioLinks: [link], showAudioPlayer: true });
    const { getByText } = render(<AudioPlayer />);
    // set audio element ref manually
    const audioEl = document.querySelector('audio') as any;
    expect(audioEl).toBeTruthy();
    // simulate clicking set A and B
    fireEvent.click(getByText('Set A'));
    expect(useStandStore.getState().audioLoopStart).toBeDefined();
    fireEvent.click(getByText('Set B'));
    expect(useStandStore.getState().audioLoopEnd).toBeDefined();
  });
});