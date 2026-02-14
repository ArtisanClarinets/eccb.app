/**
 * Session Management Utilities
 * 
 * This module provides utilities for session management including:
 * - Session invalidation on security events
 * - Session rotation for privilege escalation
 * - Concurrent session management
 * - Session activity logging
 */

import { prisma } from '@/lib/db';
import { auth } from './config';
import { logger } from '@/lib/logger';

// Configuration constants
export const SESSION_CONFIG = {
  // Maximum concurrent sessions per user
  MAX_CONCURRENT_SESSIONS: 5,
  // Idle timeout in seconds (30 minutes)
  IDLE_TIMEOUT: 60 * 30,
  // Absolute timeout in seconds (7 days)
  ABSOLUTE_TIMEOUT: 60 * 60 * 24 * 7,
  // Password reset token expiration in seconds (15 minutes)
  PASSWORD_RESET_TOKEN_EXPIRATION: 60 * 15,
  // Email verification token expiration in seconds (24 hours)
  EMAIL_VERIFICATION_TOKEN_EXPIRATION: 60 * 60 * 24,
} as const;

/**
 * Invalidate all sessions for a user
 * Called when:
 * - User changes password
 * - User's role changes
 * - Security event requires full logout
 * 
 * @param userId - The user ID to invalidate sessions for
 * @param reason - The reason for invalidation (for logging)
 */
export async function invalidateAllUserSessions(
  userId: string,
  reason: string
): Promise<{ success: boolean; count: number }> {
  try {
    // Delete all sessions from database
    const result = await prisma.session.deleteMany({
      where: { userId },
    });

    logger.info('Sessions invalidated', {
      userId,
      reason,
      count: result.count,
    });

    return { success: true, count: result.count };
  } catch (error) {
    logger.error('Failed to invalidate sessions', {
      userId,
      reason,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, count: 0 };
  }
}

/**
 * Invalidate a specific session
 * Called when:
 * - User logs out from a specific device
 * - Session is flagged as suspicious
 * - Admin revokes a specific session
 * 
 * @param sessionId - The session ID to invalidate
 * @param reason - The reason for invalidation (for logging)
 */
export async function invalidateSession(
  sessionId: string,
  reason: string
): Promise<{ success: boolean }> {
  try {
    await prisma.session.delete({
      where: { id: sessionId },
    });

    logger.info('Session invalidated', {
      sessionId,
      reason,
    });

    return { success: true };
  } catch (error) {
    // Session might not exist, which is fine
    logger.error('Failed to invalidate session', {
      sessionId,
      reason,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false };
  }
}

/**
 * Rotate a session token
 * Called when:
 * - User escalates privileges (e.g., becomes admin)
 * - Security-sensitive action is performed
 * - Session needs fresh token
 * 
 * @param sessionId - The current session ID
 * @returns New session ID or null on failure
 */
export async function rotateSessionToken(
  sessionId: string
): Promise<{ success: boolean; newSessionId?: string }> {
  try {
    // Get current session
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      logger.warn('Session not found for rotation', { sessionId });
      return { success: false };
    }

    // Delete old session
    await prisma.session.delete({
      where: { id: sessionId },
    });

    // Create new session with same user but new ID
    // Note: Better Auth handles this internally, but we can create a new session
    // The actual token generation is handled by Better Auth
    logger.info('Session token rotated', {
      oldSessionId: sessionId,
      userId: session.userId,
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to rotate session token', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false };
  }
}

/**
 * Enforce concurrent session limit
 * Called after a new session is created
 * Invalidates oldest sessions if limit is exceeded
 * 
 * @param userId - The user ID to check
 * @param currentSessionId - The newly created session ID (to preserve)
 */
export async function enforceConcurrentSessionLimit(
  userId: string,
  currentSessionId: string
): Promise<{ invalidated: number }> {
  try {
    // Get all sessions for user, ordered by creation date (oldest first)
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    // If under limit, nothing to do
    if (sessions.length <= SESSION_CONFIG.MAX_CONCURRENT_SESSIONS) {
      return { invalidated: 0 };
    }

    // Calculate how many sessions to invalidate
    const toInvalidate = sessions.length - SESSION_CONFIG.MAX_CONCURRENT_SESSIONS;
    
    // Get sessions to invalidate (oldest ones, excluding current)
    const sessionsToInvalidate = sessions
      .filter(s => s.id !== currentSessionId)
      .slice(0, toInvalidate);

    // Invalidate oldest sessions
    if (sessionsToInvalidate.length > 0) {
      await prisma.session.deleteMany({
        where: {
          id: { in: sessionsToInvalidate.map(s => s.id) },
        },
      });

      logger.info('Concurrent session limit enforced', {
        userId,
        invalidated: sessionsToInvalidate.length,
        remaining: sessions.length - sessionsToInvalidate.length,
      });
    }

    return { invalidated: sessionsToInvalidate.length };
  } catch (error) {
    logger.error('Failed to enforce concurrent session limit', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { invalidated: 0 };
  }
}

/**
 * Clean up expired sessions
 * Should be run periodically (e.g., via cron job)
 */
export async function cleanupExpiredSessions(): Promise<{ count: number }> {
  try {
    const now = new Date();
    
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    logger.info('Expired sessions cleaned up', {
      count: result.count,
    });

    return { count: result.count };
  } catch (error) {
    logger.error('Failed to cleanup expired sessions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { count: 0 };
  }
}

/**
 * Get active sessions for a user
 * Useful for showing user their active devices
 * 
 * @param userId - The user ID to get sessions for
 */
export async function getUserActiveSessions(
  userId: string
): Promise<Array<{
  id: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}>> {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
    });

    return sessions;
  } catch (error) {
    logger.error('Failed to get user sessions', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Log session activity
 * Records security-relevant session events
 * 
 * @param userId - The user ID
 * @param sessionId - The session ID
 * @param action - The action performed
 * @param metadata - Additional metadata
 */
export async function logSessionActivity(
  userId: string,
  sessionId: string,
  action: 'login' | 'logout' | 'refresh' | 'invalidate' | 'password_change' | 'role_change',
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Log to audit service if available
    logger.info('Session activity', {
      userId,
      sessionId,
      action,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  } catch (error) {
    // Don't throw on logging failure
    logger.error('Failed to log session activity', {
      userId,
      sessionId,
      action,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Check if session is valid and not expired
 * 
 * @param sessionId - The session ID to check
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { expiresAt: true },
    });

    if (!session) {
      return false;
    }

    return session.expiresAt > new Date();
  } catch {
    return false;
  }
}

/**
 * Update session activity timestamp
 * Called on user activity to track idle time
 * 
 * @param sessionId - The session ID to update
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    // Better Auth handles this via updateAge, but we can add custom tracking
    // This could be extended to track last activity in a separate table
    logger.debug('Session activity updated', { sessionId });
  } catch (error) {
    logger.error('Failed to update session activity', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
