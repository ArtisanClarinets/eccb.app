'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface ExtractedMetadata {
  title: string;
  composer?: string;
  publisher?: string;
  instrument?: string;
  partNumber?: string;
  confidenceScore: number;
  fileType?: 'FULL_SCORE' | 'CONDUCTOR_SCORE' | 'PART' | 'CONDENSED_SCORE';
  isMultiPart?: boolean;
  parts?: Array<{ instrument: string; partName: string }>;
}

interface UploadPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  renderedImage?: string | null;
  extractedMetadata?: ExtractedMetadata | null;
}

export function UploadPreviewDialog({
  open,
  onOpenChange,
  fileName,
  renderedImage,
  extractedMetadata,
}: UploadPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Preview: {fileName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Left: PDF Image */}
          <div>
            <h3 className="text-sm font-semibold mb-2">PDF Preview</h3>
            {renderedImage ? (
              <img
                src={`data:image/png;base64,${renderedImage}`}
                alt="PDF preview"
                className="w-full border rounded-lg bg-gray-50"
              />
            ) : (
              <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center border">
                <p className="text-gray-500">No preview available</p>
              </div>
            )}
          </div>

          {/* Right: Extracted Metadata */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Extracted Metadata</h3>
            {extractedMetadata ? (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Title</label>
                    <p className="text-sm font-medium">{extractedMetadata.title}</p>
                  </div>
                  {extractedMetadata.composer && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Composer</label>
                      <p className="text-sm">{extractedMetadata.composer}</p>
                    </div>
                  )}
                  {extractedMetadata.publisher && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Publisher</label>
                      <p className="text-sm">{extractedMetadata.publisher}</p>
                    </div>
                  )}
                  {extractedMetadata.instrument && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Instrument</label>
                      <p className="text-sm">{extractedMetadata.instrument}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Confidence</label>
                    <Badge
                      className={
                        extractedMetadata.confidenceScore >= 85
                          ? 'bg-green-100 text-green-800'
                          : extractedMetadata.confidenceScore >= 70
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }
                    >
                      {extractedMetadata.confidenceScore}%
                    </Badge>
                  </div>
                  {extractedMetadata.fileType && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">File Type</label>
                      <p className="text-sm">{extractedMetadata.fileType}</p>
                    </div>
                  )}
                  {extractedMetadata.isMultiPart && extractedMetadata.parts?.length ? (
                    <div>
                      <label className="text-xs font-semibold text-gray-500">Parts</label>
                      <ul className="text-sm space-y-1">
                        {extractedMetadata.parts.map((part, i) => (
                          <li key={i}>
                            • {part.instrument}: {part.partName}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">
                <p className="text-gray-500">No metadata available</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
