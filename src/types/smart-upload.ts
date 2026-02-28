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
  verificationConfidence?: number;
  corrections?: string | null;
  subtitle?: string;
  arranger?: string;
  notes?: string;
  adjudicationNotes?: string | null;
  requiresHumanReview?: boolean;
  /** Per-page header labels extracted during segmentation (1-indexed page → label text) */
  pageLabels?: Record<number, string>;
  /** Segmentation confidence from deterministic or vision-based segmentation */
  segmentationConfidence?: number;
}

export type RoutingDecision =
  | 'auto_parse_auto_approve'
  | 'auto_parse_second_pass'
  | 'no_parse_second_pass';

export type ParseStatus = 'NOT_PARSED' | 'PARSING' | 'PARSED' | 'PARSE_FAILED';

export type SecondPassStatus =
  | 'NOT_NEEDED'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETE'
  | 'FAILED';
