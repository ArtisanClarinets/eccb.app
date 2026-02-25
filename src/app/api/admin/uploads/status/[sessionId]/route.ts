import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/admin/uploads/status/[sessionId]
 *
 * Get the status of a smart upload session.
 * Used for polling progress from the frontend.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const session = await prisma.smartUploadSession.findUnique({
      where: { uploadSessionId: sessionId },
      select: {
        id: true,
        uploadSessionId: true,
        status: true,
        parseStatus: true,
        secondPassStatus: true,
        confidenceScore: true,
        routingDecision: true,
        fileName: true,
        fileSize: true,
        extractedMetadata: true,
        parsedParts: true,
        cuttingInstructions: true,
        autoApproved: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Error fetching upload status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch upload status' },
      { status: 500 }
    );
  }
}
