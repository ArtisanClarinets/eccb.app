export interface CuttingInstruction {
  instrument: string;
  partName: string;
  section: 'Woodwinds' | 'Brass' | 'Percussion' | 'Strings' | 'Keyboard' | 'Vocals' | 'Other' | 'Score';
  transposition: 'Bb' | 'Eb' | 'F' | 'C' | 'D' | 'G' | 'A';
  partNumber: number;
  pageRange: [number, number];
  /** Chair designation extracted from the part label (e.g. '1st', '2nd', 'Solo'). Stored separately
   *  from `instrument` so canonical instrument names stay clean (e.g. "Bb Clarinet", not "1st Bb Clarinet"). */
  chair?: '1st' | '2nd' | '3rd' | '4th' | 'Aux' | 'Solo' | null;
  /** Type of this part in the ensemble packet. */
  partType?: 'PART' | 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'CONDENSED_SCORE';
  /** Per-label confidence score from the OCR/LLM pass that assigned this instruction's label (0–100). */
  labelConfidence?: number;
}

export interface ParsedPartRecord {
  partName: string;
  instrument: string;
  section: string;
  transposition: string;
  partNumber: number;
  storageKey: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  pageRange: [number, number];
}

/**
 * Structured confidence breakdown for metadata extraction
 */
export interface MetadataConfidenceBreakdown {
  /** Overall confidence score (0-100) */
  overall: number;
  /** Title extraction confidence (0-100) */
  title: number;
  /** Composer extraction confidence (0-100) */
  composer: number;
  /** Arranger extraction confidence (0-100) */
  arranger: number;
  /** Part segmentation confidence (0-100) */
  segmentation: number;
  /** Source weight distribution (how much each source contributed) */
  sourceWeights: {
    textLayer?: number;
    ocr?: number;
    llmVision?: number;
    filename?: number;
  };
}

/**
 * OCR provenance for audit and reproducibility
 */
export interface OcrProvenance {
  /** Whether text layer was attempted */
  textLayerAttempt: boolean;
  /** Whether text layer succeeded */
  textLayerSuccess: boolean;
  /** Text layer extraction engine name */
  textLayerEngine?: string;
  /** Characters extracted from text layer */
  textLayerChars: number;
  /** Whether OCR was attempted */
  ocrAttempt: boolean;
  /** Whether OCR succeeded */
  ocrSuccess: boolean;
  /** OCR engine name (e.g., 'tesseract', 'header-image-hash-segmentation') */
  ocrEngine?: string;
  /** OCR confidence score (0-100) */
  ocrConfidence: number;
  /** Pages processed by OCR */
  ocrPagesProcessed?: number;
  /** Reasons for falling back to LLM vision */
  llmFallbackReasons: string[];
}

/**
 * Per-page label with provenance
 */
export interface PageLabelWithProvenance {
  /** The label text */
  label: string;
  /** Source of the label: 'text_layer', 'ocr', 'llm', 'inferred' */
  source: 'text_layer' | 'ocr' | 'llm' | 'inferred';
  /** Confidence for this specific label (0-100) */
  confidence: number;
}

export interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  /** Copyright year extracted from the score (e.g. 1977). */
  copyrightYear?: number | string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  ensembleType?: string;
  keySignature?: string;
  timeSignature?: string;
  tempo?: string;
  parts?: Array<{ instrument: string; partName: string }>;
  cuttingInstructions?: CuttingInstruction[];
  /** Source of the chosen cuttingInstructions (for audit) */
  cuttingInstructionsSource?: 'ocr' | 'llm' | 'hybrid' | 'none';
  /** OCR-derived cutting instructions (for auditing / reproducibility) */
  ocrCuttingInstructions?: CuttingInstruction[];
  /** LLM-derived cutting instructions (for auditing / reproducibility) */
  llmCuttingInstructions?: CuttingInstruction[];
  verificationConfidence?: number;
  corrections?: string | null;
  subtitle?: string;
  arranger?: string;
  notes?: string;
  adjudicationNotes?: string | null;
  requiresHumanReview?: boolean;
  /** Per-page header labels extracted during segmentation (1-indexed page → label text) */
  pageLabels?: Record<number, string>;
  /** Per-page header labels with provenance (1-indexed page → label with source) */
  pageLabelsWithProvenance?: Record<number, PageLabelWithProvenance>;
  /** Segmentation confidence from deterministic or vision-based segmentation */
  segmentationConfidence?: number;
  /** Structured confidence breakdown for enterprise audit */
  metadataConfidence?: MetadataConfidenceBreakdown;
  /** OCR provenance for reproducibility and debugging */
  ocrProvenance?: OcrProvenance;
}

export type RoutingDecision =
  | 'auto_parse_auto_approve'
  | 'auto_parse_second_pass'
  | 'no_parse_second_pass'
  | 'QUEUE_ENQUEUE_FAILED';

export type ParseStatus = 'NOT_PARSED' | 'PARSING' | 'PARSED' | 'PARSE_FAILED';

export type SecondPassStatus =
  | 'NOT_NEEDED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'FAILED';
