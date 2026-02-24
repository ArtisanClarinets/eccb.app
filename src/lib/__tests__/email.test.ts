/**
 * Tests for Email Service (src/lib/email.ts)
 * 
 * Tests email sending functionality with mocked nodemailer transport.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendEmail,
  sendBulkEmails,
  verifyEmailConnection,
  type SendEmailOptions,
} from '../email';

// Mock nodemailer
const mockSendMail = vi.fn();
const mockVerify = vi.fn();
const mockCreateTransport = vi.fn(() => ({
  sendMail: mockSendMail,
  verify: mockVerify,
}));

vi.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => (mockCreateTransport as any)(...args),
}));

// Mock fs module for outbox functionality
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockExistsSync = vi.fn(() => false);

vi.mock('fs', () => ({
  default: {
    writeFileSync: (...args: unknown[]) => (mockWriteFileSync as any)(...args),
    mkdirSync: (...args: unknown[]) => (mockMkdirSync as any)(...args),
    existsSync: (...args: unknown[]) => (mockExistsSync as any)(...args),
  },
  writeFileSync: (...args: unknown[]) => (mockWriteFileSync as any)(...args),
  mkdirSync: (...args: unknown[]) => (mockMkdirSync as any)(...args),
  existsSync: (...args: unknown[]) => (mockExistsSync as any)(...args),
}));

// Mock env
vi.mock('../env', () => ({
  env: {
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'test@test.com',
    SMTP_PASSWORD: 'test-password',
    SMTP_FROM: 'noreply@test.com',
    NEXT_PUBLIC_APP_NAME: 'Test App',
    NODE_ENV: 'test',
  },
}));

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the transporter between tests
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendEmail', () => {
    const defaultOptions: SendEmailOptions = {
      to: 'recipient@test.com',
      subject: 'Test Subject',
      html: '<p>Test content</p>',
    };

    it('should send email successfully via SMTP', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      const result = await sendEmail(defaultOptions);

      expect(result.success).toBe(true);
      expect(result.method).toBe('smtp');
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('should call sendMail with correct parameters', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      const options: SendEmailOptions = {
        ...defaultOptions,
        to: ['recipient1@test.com', 'recipient2@test.com'],
        cc: 'cc@test.com',
        bcc: 'bcc@test.com',
        replyTo: 'reply@test.com',
        text: 'Plain text content',
      };

      await sendEmail(options);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'recipient1@test.com, recipient2@test.com',
          cc: 'cc@test.com',
          bcc: 'bcc@test.com',
          replyTo: 'reply@test.com',
          subject: 'Test Subject',
          text: 'Plain text content',
        })
      );
    });

    it('should wrap HTML content in email template', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      await sendEmail({
        ...defaultOptions,
        html: '<strong>Bold content</strong>',
      });

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('<!DOCTYPE html>');
      expect(callArgs.html).toContain('<strong>Bold content</strong>');
      expect(callArgs.html).toContain('Test App');
    });

    it('should handle attachments', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      const options: SendEmailOptions = {
        ...defaultOptions,
        attachments: [
          {
            filename: 'test.pdf',
            content: Buffer.from('test content'),
            contentType: 'application/pdf',
          },
        ],
      };

      await sendEmail(options);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'test.pdf',
              content: Buffer.from('test content'),
              contentType: 'application/pdf',
            },
          ],
        })
      );
    });

    it('should fallback to outbox when SMTP fails in test environment', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      const result = await sendEmail(defaultOptions);

      // In test environment, it falls back to outbox
      expect(result.success).toBe(true);
      expect(result.method).toBe('outbox');
      expect(result.filepath).toBeDefined();
    });

    it('should use custom from address when provided', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      await sendEmail({
        ...defaultOptions,
        from: 'Custom Sender <custom@test.com>',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Custom Sender <custom@test.com>',
        })
      );
    });
  });

  describe('sendBulkEmails', () => {
    it('should send multiple emails successfully', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'test-message-id' });

      const emails: SendEmailOptions[] = [
        { to: 'user1@test.com', subject: 'Test 1', html: '<p>Content 1</p>' },
        { to: 'user2@test.com', subject: 'Test 2', html: '<p>Content 2</p>' },
        { to: 'user3@test.com', subject: 'Test 3', html: '<p>Content 3</p>' },
      ];

      const result = await sendBulkEmails(emails, 0); // No delay for tests

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockSendMail).toHaveBeenCalledTimes(3);
    });

    it('should track failed emails with fallback to outbox', async () => {
      mockSendMail
        .mockResolvedValueOnce({ messageId: 'test-message-id' })
        .mockRejectedValueOnce(new Error('Failed for user2'))
        .mockResolvedValueOnce({ messageId: 'test-message-id' });

      const emails: SendEmailOptions[] = [
        { to: 'user1@test.com', subject: 'Test 1', html: '<p>Content 1</p>' },
        { to: 'user2@test.com', subject: 'Test 2', html: '<p>Content 2</p>' },
        { to: 'user3@test.com', subject: 'Test 3', html: '<p>Content 3</p>' },
      ];

      const result = await sendBulkEmails(emails, 0);

      // In test environment, failed emails fall back to outbox, so they still succeed
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should fallback to outbox when all SMTP sends fail', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP down'));

      const emails: SendEmailOptions[] = [
        { to: 'user1@test.com', subject: 'Test 1', html: '<p>Content 1</p>' },
        { to: 'user2@test.com', subject: 'Test 2', html: '<p>Content 2</p>' },
      ];

      const result = await sendBulkEmails(emails, 0);

      // In test environment, all emails fall back to outbox
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle empty email list', async () => {
      const result = await sendBulkEmails([], 0);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmailConnection', () => {
    it('should return true when SMTP connection is valid', async () => {
      mockVerify.mockResolvedValueOnce(true);

      const result = await verifyEmailConnection();

      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it('should return false when SMTP connection fails', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await verifyEmailConnection();

      expect(result).toBe(false);
    });
  });

  describe('Email Template', () => {
    it('should include app name in template', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      await sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Content</p>',
      });

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Test App');
    });

    it('should include current year in footer', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      await sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Content</p>',
      });

      const html = mockSendMail.mock.calls[0][0].html;
      const currentYear = new Date().getFullYear().toString();
      expect(html).toContain(currentYear);
    });

    it('should use primary color for styling', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });

      await sendEmail({
        to: 'test@test.com',
        subject: 'Test',
        html: '<p>Content</p>',
      });

      const html = mockSendMail.mock.calls[0][0].html;
      // Primary color #0f766e
      expect(html).toContain('#0f766e');
    });
  });
});
