import { validateAndNormalizeInstructions } from '@/lib/services/cutting-instructions';
import type { CuttingInstruction } from '@/types/smart-upload';

export type CuttingInstructionsSource = 'ocr' | 'llm' | 'hybrid' | 'none';

export interface CuttingInstructionsAudit {
  /** The final chosen cutting instructions used for splitting */
  chosenInstructions: CuttingInstruction[];
  /** The source that was chosen */
  source: CuttingInstructionsSource;
  /** Original OCR-derived instructions (if any) */
  ocrInstructions?: CuttingInstruction[];
  /** Original LLM-derived instructions (if any) */
  llmInstructions?: CuttingInstruction[];
  /** Confidence score associated with the OCR source (0-100) */
  ocrConfidence?: number;
  /** Confidence score associated with the LLM source (0-100) */
  llmConfidence?: number;
  /** Whether OCR instructions contained detected gaps */
  ocrHasGaps?: boolean;
  /** Whether LLM instructions contained detected gaps */
  llmHasGaps?: boolean;
}

/**
 * Choose the best cutting instructions between OCR-derived and LLM-derived results.
 *
 * Policy:
 * - Prefer OCR if it produces valid instructions with no gaps.
 * - Allow LLM to override only when it is demonstrably better:
 *   * LLM has no gaps AND (LLM confidence is significantly higher OR OCR has gaps)
 * - Always record both sources for auditing.
 */
export function chooseBestCuttingInstructions(params: {
  totalPages: number;
  ocrInstructions?: CuttingInstruction[];
  ocrConfidence?: number;
  llmInstructions?: CuttingInstruction[];
  llmConfidence?: number;
  enforceOcr?: boolean;
}): CuttingInstructionsAudit {
  const {
    totalPages,
    ocrInstructions = [],
    ocrConfidence,
    llmInstructions = [],
    llmConfidence,
    enforceOcr = false,
  } = params;

  const ocrResult = ocrInstructions.length
    ? validateAndNormalizeInstructions(ocrInstructions, totalPages, {
        oneIndexed: true,
        detectGaps: true,
      })
    : null;

  const llmResult = llmInstructions.length
    ? validateAndNormalizeInstructions(llmInstructions, totalPages, {
        oneIndexed: true,
        detectGaps: true,
      })
    : null;

  const ocrHasGaps = Boolean(ocrResult?.gaps && ocrResult.gaps.length > 0);
  const llmHasGaps = Boolean(llmResult?.gaps && llmResult.gaps.length > 0);

  // Even if validation reports warnings/errors, we still consider a non-empty
  // instruction set as “valid” for selection purposes as long as it has no gaps.
  const ocrValid = ocrInstructions.length > 0 && !ocrHasGaps;
  const llmValid = llmInstructions.length > 0 && !llmHasGaps;

  const ocrConf = typeof ocrConfidence === 'number' ? Math.max(0, Math.min(100, Math.round(ocrConfidence))) : undefined;
  const llmConf = typeof llmConfidence === 'number' ? Math.max(0, Math.min(100, Math.round(llmConfidence))) : undefined;

  const shouldOverrideWithLlm = (): boolean => {
    if (enforceOcr && ocrValid) return false;
    if (!llmValid) return false;
    if (!ocrValid) return true;

    // If OCR has gaps but LLM does not, prefer LLM regardless of confidence.
    if (ocrHasGaps && !llmHasGaps) return true;

    // Require a meaningful confidence boost from LLM to override OCR.
    // This avoids flipping to LLM for marginal confidence gains.
    if (typeof llmConf === 'number' && typeof ocrConf === 'number') {
      return llmConf >= ocrConf + 15;
    }

    // If we lack confidence metrics, prefer OCR unless LLM is strictly gap-free and OCR has gaps.
    return false;
  };

  const chosenSource: CuttingInstructionsSource = (() => {
    if (enforceOcr) {
      if (ocrValid) return 'ocr';
      if (llmValid) return 'llm';
      return 'none';
    }

    if (shouldOverrideWithLlm()) return 'llm';
    if (ocrValid) return llmValid ? 'hybrid' : 'ocr';
    if (llmValid) return 'llm';
    return 'none';
  })();

  const chosenInstructions =
    chosenSource === 'llm' ? llmInstructions : ocrInstructions;

  return {
    chosenInstructions,
    source: chosenSource,
    ocrInstructions: ocrInstructions.length ? ocrInstructions : undefined,
    llmInstructions: llmInstructions.length ? llmInstructions : undefined,
    ocrConfidence: ocrConf,
    llmConfidence: llmConf,
    ocrHasGaps,
    llmHasGaps,
  };
}
