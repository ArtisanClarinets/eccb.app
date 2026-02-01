import { createTransport, Transporter } from 'nodemailer';
import { env } from '@/lib/env';

let transporter: Transporter | null = null;

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

export async function sendEmail(options: SendEmailOptions): Promise<void> {
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
  } catch (error) {
    console.error('Failed to send email:', error);
    // In development, log the email content instead of failing
    if (env.NODE_ENV === 'development') {
      console.log('Development mode - Email content:');
      console.log('To:', mailOptions.to);
      console.log('Subject:', mailOptions.subject);
      console.log('HTML:', options.html);
    } else {
      throw error;
    }
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
      await sendEmail(email);
      results.success++;
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
