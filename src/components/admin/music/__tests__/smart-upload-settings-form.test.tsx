// create new test file
// src/components/admin/music/__tests__/smart-upload-settings-form.test.tsx
// @vitest-environment jsdom

// radix use-size hook triggers mocking issues in jsdom; stub the package only
// vi.mock('@radix-ui/react-use-size', () => ({
//   useSize: () => ({ width: 0, height: 0 }),
// }));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SmartUploadSettingsForm } from '../smart-upload-settings-form';

// helper to render form with settings
function renderForm(settings: Record<string, string>) {
  return render(<SmartUploadSettingsForm settings={settings} />);
}

// default minimal settings object
const baseSettings: Record<string, string> = {
  llm_provider: 'ollama',
  llm_vision_model: 'any',
  llm_verification_model: 'any',
  llm_vision_system_prompt: 'p',
  llm_verification_system_prompt: 'p',
};

describe('SmartUploadSettingsForm (UI)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // restore mocked globals then stub the ones we need
    // stub ResizeObserver since vitest may replace it with a mock
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    // stub global fetch for model discovery and save
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [], recommendedModel: null }) }));
  });

  it('renders OCR-first fields and parses defaults correctly', () => {
    renderForm({
      ...baseSettings,
      smart_upload_enable_ocr_first: 'false',
      smart_upload_text_layer_threshold_pct: '25',
      smart_upload_ocr_mode: 'header',
      smart_upload_ocr_max_pages: '5',
      smart_upload_text_probe_pages: '8',
      smart_upload_store_raw_ocr_text: 'true',
      smart_upload_ocr_engine: 'ocrmypdf',
      smart_upload_ocr_rate_limit_rpm: '12',
      smart_upload_llm_max_pages: '20',
      smart_upload_llm_max_header_batches: '4',
    });

    expect(screen.getByLabelText(/Enable OCR-first Pipeline/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Text Layer Threshold/i)).toHaveValue(25);
    // engine/mode fields are rendered (as labels or text)
    expect(screen.getByText(/OCR Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/OCR Mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Store Raw OCR Text/i)).toBeChecked();
    expect(screen.getByLabelText(/OCR Rate Limit/i)).toHaveValue(12);
    expect(screen.getByLabelText(/LLM Max Pages/i)).toHaveValue(20);
    expect(screen.getByLabelText(/LLM Max Header Batches/i)).toHaveValue(4);
  });

  // provider-step presence already implicitly covered elsewhere
});
