import { prisma } from '@/lib/db';
import { EmailTemplate, EmailTemplateType } from '@prisma/client';
import {
  substituteVariables,
  extractTemplateVariables,
  validateTemplateVariables,
  TemplateVariable,
  RenderedTemplate,
} from '@/lib/email-template-utils';

// Re-export types and utilities for convenience
export type { TemplateVariable, RenderedTemplate };
export { substituteVariables, extractTemplateVariables, validateTemplateVariables };

// ====================================
// Types
// ====================================

export interface CreateTemplateData {
  name: string;
  type: EmailTemplateType;
  subject: string;
  body: string;
  textBody?: string;
  description?: string;
  variables?: TemplateVariable[];
  isActive?: boolean;
  isDefault?: boolean;
  createdBy?: string;
}

export interface UpdateTemplateData {
  name?: string;
  type?: EmailTemplateType;
  subject?: string;
  body?: string;
  textBody?: string;
  description?: string;
  variables?: TemplateVariable[];
  isActive?: boolean;
  isDefault?: boolean;
}

// ====================================
// Default Templates
// ====================================

export const DEFAULT_TEMPLATES: CreateTemplateData[] = [
  {
    name: 'Welcome Email',
    type: EmailTemplateType.WELCOME,
    subject: 'Welcome to {{organizationName}}!',
    body: `<p>Hello {{firstName}},</p>
<p>Welcome to {{organizationName}}! We're excited to have you join our community band.</p>
<p>Your account has been created and you can now access the member portal to:</p>
<ul>
  <li>View upcoming events and rehearsals</li>
  <li>Access sheet music and recordings</li>
  <li>Track your attendance</li>
  <li>Receive important announcements</li>
</ul>
<p><a href="{{loginUrl}}" class="button">Access Member Portal</a></p>
<p>If you have any questions, please don't hesitate to reach out to our team.</p>
<p>Best regards,<br>{{organizationName}} Team</p>`,
    textBody: `Hello {{firstName}},

Welcome to {{organizationName}}! We're excited to have you join our community band.

Your account has been created and you can now access the member portal to:
- View upcoming events and rehearsals
- Access sheet music and recordings
- Track your attendance
- Receive important announcements

Access the Member Portal: {{loginUrl}}

If you have any questions, please don't hesitate to reach out to our team.

Best regards,
{{organizationName}} Team`,
    description: 'Sent to new members when they join the organization',
    variables: [
      { name: 'firstName', description: 'Member first name', required: true },
      { name: 'lastName', description: 'Member last name', required: true },
      { name: 'organizationName', description: 'Organization name', required: true },
      { name: 'loginUrl', description: 'URL to the member portal', required: true },
    ],
    isDefault: true,
  },
  {
    name: 'Password Reset',
    type: EmailTemplateType.PASSWORD_RESET,
    subject: 'Reset Your Password',
    body: `<p>Hello {{firstName}},</p>
<p>We received a request to reset your password for your {{organizationName}} account.</p>
<p><a href="{{resetUrl}}" class="button">Reset Password</a></p>
<p>This link will expire in {{expirationTime}}.</p>
<p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
<p>Best regards,<br>{{organizationName}} Team</p>`,
    textBody: `Hello {{firstName}},

We received a request to reset your password for your {{organizationName}} account.

Reset your password: {{resetUrl}}

This link will expire in {{expirationTime}}.

If you did not request a password reset, please ignore this email or contact support if you have concerns.

Best regards,
{{organizationName}} Team`,
    description: 'Sent when a user requests to reset their password',
    variables: [
      { name: 'firstName', description: 'User first name', required: true },
      { name: 'organizationName', description: 'Organization name', required: true },
      { name: 'resetUrl', description: 'Password reset URL', required: true },
      { name: 'expirationTime', description: 'Link expiration time (e.g., "1 hour")', required: true },
    ],
    isDefault: true,
  },
  {
    name: 'Event Reminder',
    type: EmailTemplateType.EVENT_REMINDER,
    subject: 'Reminder: {{eventTitle}} on {{eventDate}}',
    body: `<p>Hello {{firstName}},</p>
<p>This is a reminder about the upcoming event:</p>
<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
  <h3 style="margin: 0 0 8px 0;">{{eventTitle}}</h3>
  <p style="margin: 0;"><strong>Date:</strong> {{eventDate}}</p>
  <p style="margin: 0;"><strong>Time:</strong> {{eventTime}}</p>
  {{#if eventLocation}}<p style="margin: 0;"><strong>Location:</strong> {{eventLocation}}</p>{{/if}}
  {{#if callTime}}<p style="margin: 0;"><strong>Call Time:</strong> {{callTime}}</p>{{/if}}
</div>
{{#if eventDescription}}<p>{{eventDescription}}</p>{{/if}}
{{#if rsvpUrl}}<p><a href="{{rsvpUrl}}" class="button">RSVP Now</a></p>{{/if}}
<p>Please make sure to arrive on time and bring any required materials.</p>
<p>Best regards,<br>{{organizationName}} Team</p>`,
    textBody: `Hello {{firstName}},

This is a reminder about the upcoming event:

{{eventTitle}}
Date: {{eventDate}}
Time: {{eventTime}}
{{#if eventLocation}}Location: {{eventLocation}}{{/if}}
{{#if callTime}}Call Time: {{callTime}}{{/if}}

{{#if eventDescription}}{{eventDescription}}{{/if}}

{{#if rsvpUrl}}RSVP: {{rsvpUrl}}{{/if}}

Please make sure to arrive on time and bring any required materials.

Best regards,
{{organizationName}} Team`,
    description: 'Sent to remind members about upcoming events',
    variables: [
      { name: 'firstName', description: 'Member first name', required: true },
      { name: 'organizationName', description: 'Organization name', required: true },
      { name: 'eventTitle', description: 'Event title', required: true },
      { name: 'eventDate', description: 'Event date', required: true },
      { name: 'eventTime', description: 'Event time', required: true },
      { name: 'eventLocation', description: 'Event location', required: false },
      { name: 'callTime', description: 'Call time for the event', required: false },
      { name: 'eventDescription', description: 'Event description', required: false },
      { name: 'rsvpUrl', description: 'RSVP link', required: false },
    ],
    isDefault: true,
  },
  {
    name: 'Announcement Notification',
    type: EmailTemplateType.ANNOUNCEMENT,
    subject: '{{announcementTitle}}',
    body: `<p>Hello {{firstName}},</p>
<p>A new announcement has been posted:</p>
<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
  <h3 style="margin: 0 0 8px 0;">{{announcementTitle}}</h3>
  <p style="margin: 0;">{{announcementSummary}}</p>
</div>
{{#if announcementUrl}}<p><a href="{{announcementUrl}}" class="button">Read Full Announcement</a></p>{{/if}}
{{#if isUrgent}}<p style="color: #dc2626; font-weight: bold;">This is an urgent announcement.</p>{{/if}}
<p>Best regards,<br>{{organizationName}} Team</p>`,
    textBody: `Hello {{firstName}},

A new announcement has been posted:

{{announcementTitle}}
{{announcementSummary}}

{{#if announcementUrl}}Read the full announcement: {{announcementUrl}}{{/if}}

{{#if isUrgent}}This is an urgent announcement.{{/if}}

Best regards,
{{organizationName}} Team`,
    description: 'Sent when a new announcement is published',
    variables: [
      { name: 'firstName', description: 'Member first name', required: true },
      { name: 'organizationName', description: 'Organization name', required: true },
      { name: 'announcementTitle', description: 'Announcement title', required: true },
      { name: 'announcementSummary', description: 'Brief summary of the announcement', required: true },
      { name: 'announcementUrl', description: 'Link to full announcement', required: false },
      { name: 'isUrgent', description: 'Whether this is an urgent announcement', required: false },
    ],
    isDefault: true,
  },
  {
    name: 'Attendance Summary',
    type: EmailTemplateType.ATTENDANCE_SUMMARY,
    subject: 'Your Attendance Summary for {{period}}',
    body: `<p>Hello {{firstName}},</p>
<p>Here is your attendance summary for {{period}}:</p>
<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
  <h3 style="margin: 0 0 16px 0;">Attendance Statistics</h3>
  <p style="margin: 0 0 8px 0;"><strong>Total Events:</strong> {{totalEvents}}</p>
  <p style="margin: 0 0 8px 0;"><strong>Present:</strong> {{presentCount}}</p>
  <p style="margin: 0 0 8px 0;"><strong>Absent:</strong> {{absentCount}}</p>
  <p style="margin: 0 0 8px 0;"><strong>Excused:</strong> {{excusedCount}}</p>
  <p style="margin: 0;"><strong>Attendance Rate:</strong> {{attendanceRate}}%</p>
</div>
{{#if attendanceUrl}}<p><a href="{{attendanceUrl}}" class="button">View Full Details</a></p>{{/if}}
<p>Keep up the great work!</p>
<p>Best regards,<br>{{organizationName}} Team</p>`,
    textBody: `Hello {{firstName}},

Here is your attendance summary for {{period}}:

Attendance Statistics
- Total Events: {{totalEvents}}
- Present: {{presentCount}}
- Absent: {{absentCount}}
- Excused: {{excusedCount}}
- Attendance Rate: {{attendanceRate}}%

{{#if attendanceUrl}}View full details: {{attendanceUrl}}{{/if}}

Keep up the great work!

Best regards,
{{organizationName}} Team`,
    description: 'Sent to members with their attendance statistics',
    variables: [
      { name: 'firstName', description: 'Member first name', required: true },
      { name: 'organizationName', description: 'Organization name', required: true },
      { name: 'period', description: 'Time period (e.g., "January 2024")', required: true },
      { name: 'totalEvents', description: 'Total number of events', required: true },
      { name: 'presentCount', description: 'Number of events attended', required: true },
      { name: 'absentCount', description: 'Number of absences', required: true },
      { name: 'excusedCount', description: 'Number of excused absences', required: true },
      { name: 'attendanceRate', description: 'Attendance percentage', required: true },
      { name: 'attendanceUrl', description: 'Link to attendance details', required: false },
    ],
    isDefault: true,
  },
];

// ====================================
// Template Service (Server-side only)
// ====================================

/**
 * Get all email templates
 */
export async function getTemplates(options?: {
  type?: EmailTemplateType;
  isActive?: boolean;
}): Promise<EmailTemplate[]> {
  const where: Record<string, unknown> = {};
  
  if (options?.type !== undefined) {
    where.type = options.type;
  }
  if (options?.isActive !== undefined) {
    where.isActive = options.isActive;
  }

  return prisma.emailTemplate.findMany({
    where,
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
}

/**
 * Get a template by ID
 */
export async function getTemplateById(id: string): Promise<EmailTemplate | null> {
  return prisma.emailTemplate.findUnique({
    where: { id },
  });
}

/**
 * Get a template by name
 */
export async function getTemplateByName(name: string): Promise<EmailTemplate | null> {
  return prisma.emailTemplate.findUnique({
    where: { name },
  });
}

/**
 * Get the default template for a type
 */
export async function getDefaultTemplate(type: EmailTemplateType): Promise<EmailTemplate | null> {
  return prisma.emailTemplate.findFirst({
    where: {
      type,
      isDefault: true,
      isActive: true,
    },
  });
}

/**
 * Create a new email template
 */
export async function createTemplate(data: CreateTemplateData): Promise<EmailTemplate> {
  // If this is set as default, unset any existing default for this type
  if (data.isDefault) {
    await prisma.emailTemplate.updateMany({
      where: {
        type: data.type,
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }

  return prisma.emailTemplate.create({
    data: {
      name: data.name,
      type: data.type,
      subject: data.subject,
      body: data.body,
      textBody: data.textBody,
      description: data.description,
      variables: data.variables ? JSON.stringify(data.variables) : null,
      isActive: data.isActive ?? true,
      isDefault: data.isDefault ?? false,
      createdBy: data.createdBy,
    },
  });
}

/**
 * Update an email template
 */
export async function updateTemplate(id: string, data: UpdateTemplateData): Promise<EmailTemplate> {
  // If this is set as default, unset any existing default for this type
  if (data.isDefault && data.type) {
    await prisma.emailTemplate.updateMany({
      where: {
        type: data.type,
        isDefault: true,
        id: { not: id },
      },
      data: { isDefault: false },
    });
  }

  return prisma.emailTemplate.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.textBody !== undefined && { textBody: data.textBody }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.variables !== undefined && { variables: data.variables ? JSON.stringify(data.variables) : null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
  });
}

/**
 * Delete an email template
 */
export async function deleteTemplate(id: string): Promise<EmailTemplate> {
  return prisma.emailTemplate.delete({
    where: { id },
  });
}

/**
 * Render a template with variables
 */
export async function renderTemplate(
  template: EmailTemplate,
  variables: Record<string, unknown>
): Promise<RenderedTemplate> {
  const html = substituteVariables(template.body, variables);
  const subject = substituteVariables(template.subject, variables);
  const text = template.textBody ? substituteVariables(template.textBody, variables) : undefined;

  return { subject, html, text };
}

/**
 * Render a template by type (uses default if no specific template provided)
 */
export async function renderTemplateByType(
  type: EmailTemplateType,
  variables: Record<string, unknown>,
  templateId?: string
): Promise<RenderedTemplate | null> {
  let template: EmailTemplate | null = null;

  if (templateId) {
    template = await getTemplateById(templateId);
  } else {
    template = await getDefaultTemplate(type);
  }

  if (!template) {
    return null;
  }

  return renderTemplate(template, variables);
}

/**
 * Initialize default templates in the database
 */
export async function initializeDefaultTemplates(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const templateData of DEFAULT_TEMPLATES) {
    const existing = await getTemplateByName(templateData.name);
    if (existing) {
      skipped++;
      continue;
    }

    await createTemplate(templateData);
    created++;
  }

  return { created, skipped };
}

/**
 * Validate that all required variables are provided
 * This is a wrapper around the utility function for server-side use
 */
export { validateTemplateVariables as validateTemplateVariablesServer };
