import { prisma } from '@/lib/db';
import type { CuttingInstructionsSource } from '@/lib/smart-upload/cutting-instruction-selection';

/**
 * Fetch the cutting instructions source (OCR/LLM/hybrid/none) for a Smart Upload session.
 *
 * This is useful for diagnostic tooling and admin reporting without needing to
 * parse the entire extractedMetadata blob everywhere.
 */
export async function getCuttingInstructionsSourceForSession(
  uploadSessionId: string,
): Promise<CuttingInstructionsSource | null> {
  const session = await prisma.smartUploadSession.findUnique({
    where: { uploadSessionId },
    select: { extractedMetadata: true },
  });
  if (!session || !session.extractedMetadata) return null;

  try {
    const metadata = JSON.parse(session.extractedMetadata) as { cuttingInstructionsSource?: CuttingInstructionsSource };
    return metadata.cuttingInstructionsSource ?? null;
  } catch {
    return null;
  }
}
