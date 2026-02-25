export interface CuttingInstruction {
  instrument: string;
  partName: string;
  section: 'Woodwinds' | 'Brass' | 'Percussion' | 'Strings' | 'Keyboard' | 'Vocals' | 'Other' | 'Score';
  transposition: 'Bb' | 'Eb' | 'F' | 'C' | 'D' | 'G' | 'A';
  partNumber: number;
  pageRange: [number, number];
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
