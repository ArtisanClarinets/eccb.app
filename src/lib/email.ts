import { createTransport, Transporter } from 'nodemailer';
import { env } from '@/lib/env';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

let transporter: Transporter | null = null;

// Check if SMTP is configured
function isSmtpConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_PORT);
}

// Get the outbox directory path
function getOutboxDir(): string {
  return join(process.cwd(), 'outbox');
}

// Ensure outbox directory exists
function ensureOutboxDir(): void {
  const outboxDir = getOutboxDir();
  if (!existsSync(outboxDir)) {
    mkdirSync(outboxDir, { recursive: true });
  }
}

// Write email to local file as .eml format
function writeToOutbox(options: SendEmailOptions): string {
  ensureOutboxDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedName = options.subject.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  const filename = `${timestamp}_${sanitizedName}.eml`;
  const filepath = join(getOutboxDir(), filename);
  
  const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const from = `${env.NEXT_PUBLIC_APP_NAME} <${env.SMTP_FROM}>`;
  
  const emlContent = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${options.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    options.html,
  ].join('\r\n');
  
  writeFileSync(filepath, emlContent, 'utf-8');
  console.log(`Email written to outbox: ${filepath}`);
  
  return filepath;
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER && env.SMTP_PASSWORD
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASSWORD,
          }
        : undefined,
      // For local Postfix without auth
      tls: {
        rejectUnauthorized: env.NODE_ENV === 'production',
      },
    });
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  method: 'smtp' | 'outbox';
  filepath?: string;
  error?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  // If SMTP is not configured, write to local outbox
  if (!isSmtpConfigured()) {
    console.log('SMTP not configured, writing email to local outbox');
    try {
      const filepath = writeToOutbox(options);
      return { success: true, method: 'outbox', filepath };
    } catch (error) {
      console.error('Failed to write email to outbox:', error);
      return { 
        success: false, 
        method: 'outbox', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
  
  const transport = getTransporter();
  
  const mailOptions = {
    from: options.from || `${env.NEXT_PUBLIC_APP_NAME} <${env.SMTP_FROM}>`,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    html: wrapEmailTemplate(options.html),
    text: options.text,
    replyTo: options.replyTo,
    cc: options.cc,
    bcc: options.bcc,
    attachments: options.attachments,
  };

  try {
    await transport.sendMail(mailOptions);
    console.log(`Email sent to ${mailOptions.to}: ${options.subject}`);
    return { success: true, method: 'smtp' };
  } catch (error) {
    console.error('Failed to send email via SMTP:', error);
    
    // Fallback to outbox if SMTP fails
    if (env.NODE_ENV !== 'production') {
      console.log('Falling back to local outbox');
      try {
        const filepath = writeToOutbox(options);
        return { success: true, method: 'outbox', filepath };
      } catch (outboxError) {
        console.error('Failed to write email to outbox:', outboxError);
      }
    }
    
    return { 
      success: false, 
      method: 'smtp', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

function wrapEmailTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${env.NEXT_PUBLIC_APP_NAME}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9fafb;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e5e7eb;
    }
    .header h1 {
      color: #0f766e;
      font-size: 24px;
      margin: 0;
    }
    .content {
      margin-bottom: 24px;
    }
    .footer {
      text-align: center;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 14px;
    }
    a {
      color: #0f766e;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #0f766e;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      margin: 16px 0;
    }
    .button:hover {
      background-color: #0d655d;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${env.NEXT_PUBLIC_APP_NAME}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${env.NEXT_PUBLIC_APP_NAME}. All rights reserved.</p>
      <p>This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Bulk email sending with rate limiting
export async function sendBulkEmails(
  emails: SendEmailOptions[],
  delayMs: number = 100
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`${email.to}: ${result.error || 'Unknown error'}`);
      }
      // Delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      results.failed++;
      results.errors.push(`${email.to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

// Verify SMTP connection
export async function verifyEmailConnection(): Promise<boolean> {
  if (!isSmtpConfigured()) {
    console.log('SMTP not configured - emails will be written to local outbox');
    return false;
  }
  
  try {
    const transport = getTransporter();
    await transport.verify();
    console.log('SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('SMTP connection failed:', error);
    return false;
  }
}
