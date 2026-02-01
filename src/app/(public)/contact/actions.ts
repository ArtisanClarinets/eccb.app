'use server';

import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(10),
});

const subjectLabels: Record<string, string> = {
  general: 'General Inquiry',
  join: 'Joining the Band',
  booking: 'Event Booking',
  sponsorship: 'Sponsorship',
  feedback: 'Feedback',
  other: 'Other',
};

export async function submitContactForm(data: unknown) {
  try {
    // Rate limiting
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    
    const rateLimitResult = await rateLimit(`contact:${ip}`, {
      limit: 5,
      window: 3600, // 1 hour
    });

    if (!rateLimitResult.success) {
      return {
        success: false,
        error: 'Too many messages. Please try again later.',
      };
    }

    // Validate input
    const validatedData = contactSchema.parse(data);

    // Send email notification to admin
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@eccb.app',
      subject: `[Contact Form] ${subjectLabels[validatedData.subject] || validatedData.subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Name</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${validatedData.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email</td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              <a href="mailto:${validatedData.email}">${validatedData.email}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Subject</td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              ${subjectLabels[validatedData.subject] || validatedData.subject}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;" colspan="2">Message</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;" colspan="2">
              ${validatedData.message.replace(/\n/g, '<br>')}
            </td>
          </tr>
        </table>
      `,
      text: `
New Contact Form Submission

Name: ${validatedData.name}
Email: ${validatedData.email}
Subject: ${subjectLabels[validatedData.subject] || validatedData.subject}

Message:
${validatedData.message}
      `,
      replyTo: validatedData.email,
    });

    // Send confirmation email to user
    await sendEmail({
      to: validatedData.email,
      subject: 'Thank you for contacting Emerald Coast Community Band',
      html: `
        <h2>Thank you for reaching out!</h2>
        <p>Hi ${validatedData.name},</p>
        <p>We've received your message and will get back to you as soon as possible.</p>
        <p>Here's a copy of your message:</p>
        <blockquote style="border-left: 4px solid #0f766e; padding-left: 16px; margin: 16px 0; color: #666;">
          ${validatedData.message.replace(/\n/g, '<br>')}
        </blockquote>
        <p>Best regards,<br>The Emerald Coast Community Band</p>
      `,
      text: `
Thank you for reaching out!

Hi ${validatedData.name},

We've received your message and will get back to you as soon as possible.

Here's a copy of your message:

${validatedData.message}

Best regards,
The Emerald Coast Community Band
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Contact form error:', error);
    
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Invalid form data. Please check your inputs.',
      };
    }

    return {
      success: false,
      error: 'Failed to send message. Please try again later.',
    };
  }
}
