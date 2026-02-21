import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  substituteVariables,
  extractTemplateVariables,
  validateTemplateVariables,
} from '@/lib/email-template-utils';
import { DEFAULT_TEMPLATES } from '../email-template.service';

// Mock the db module
vi.mock('@/lib/db', () => ({
  db: {
    emailTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe('Email Template Utilities', () => {
  describe('substituteVariables', () => {
    it('should replace simple variables', () => {
      const template = 'Hello {{name}}, welcome to {{organization}}!';
      const variables = { name: 'John', organization: 'ECCB' };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Hello John, welcome to ECCB!');
    });

    it('should handle missing variables by returning empty string', () => {
      const template = 'Hello {{name}}, your code is {{code}}';
      const variables = { name: 'John' };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Hello John, your code is ');
    });

    it('should handle null/undefined variables', () => {
      const template = 'Hello {{name}}, code: {{code}}';
      const variables = { name: 'John', code: null };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Hello John, code: ');
    });

    it('should handle conditional blocks when variable is truthy', () => {
      const template = 'Hello {{name}}{{#if location}}, see you at {{location}}{{/if}}!';
      const variables = { name: 'John', location: 'Hall A' };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Hello John, see you at Hall A!');
    });

    it('should remove conditional blocks when variable is falsy', () => {
      const template = 'Hello {{name}}{{#if location}}, see you at {{location}}{{/if}}!';
      const variables = { name: 'John', location: '' };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Hello John!');
    });

    it('should handle multiple conditional blocks', () => {
      const template = '{{#if a}}A{{/if}}{{#if b}}B{{/if}}{{#if c}}C{{/if}}';
      const variables = { a: true, b: false, c: 'yes' };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('AC');
    });

    it('should handle nested variables in conditionals', () => {
      const template = '{{#if showDetails}}Name: {{name}}, Location: {{location}}{{/if}}';
      const variables = { showDetails: true, name: 'Event', location: 'Room 1' };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Name: Event, Location: Room 1');
    });

    it('should convert numbers and booleans to strings', () => {
      const template = 'Count: {{count}}, Active: {{active}}';
      const variables = { count: 42, active: true };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Count: 42, Active: true');
    });

    it('should handle empty template', () => {
      const template = '';
      const variables = { name: 'John' };
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('');
    });

    it('should handle template with no variables', () => {
      const template = 'Hello, this is a static message.';
      const variables = {};
      
      const result = substituteVariables(template, variables);
      
      expect(result).toBe('Hello, this is a static message.');
    });
  });

  describe('extractTemplateVariables', () => {
    it('should extract simple variables', () => {
      const template = 'Hello {{name}}, welcome to {{organization}}!';
      
      const result = extractTemplateVariables(template);
      
      expect(result).toContain('name');
      expect(result).toContain('organization');
      expect(result).toHaveLength(2);
    });

    it('should extract variables from conditionals', () => {
      const template = '{{#if showDetails}}Name: {{name}}{{/if}}';
      
      const result = extractTemplateVariables(template);
      
      expect(result).toContain('showDetails');
      expect(result).toContain('name');
      expect(result).toHaveLength(2);
    });

    it('should deduplicate variables', () => {
      const template = '{{name}} and {{name}} and {{name}}';
      
      const result = extractTemplateVariables(template);
      
      expect(result).toEqual(['name']);
    });

    it('should return empty array for no variables', () => {
      const template = 'No variables here!';
      
      const result = extractTemplateVariables(template);
      
      expect(result).toEqual([]);
    });

    it('should handle complex template', () => {
      const template = `
        Hello {{firstName}},
        {{#if eventTitle}}Event: {{eventTitle}}{{/if}}
        Date: {{eventDate}}
        {{#if rsvpUrl}}RSVP: {{rsvpUrl}}{{/if}}
      `;
      
      const result = extractTemplateVariables(template);
      
      expect(result).toContain('firstName');
      expect(result).toContain('eventTitle');
      expect(result).toContain('eventDate');
      expect(result).toContain('rsvpUrl');
      expect(result).toHaveLength(4);
    });
  });

  describe('validateTemplateVariables', () => {
    it('should return valid when all required variables are provided', () => {
      const templateVariables = [
        { name: 'name', description: '', required: true },
        { name: 'email', description: '', required: true },
      ];
      const provided = { name: 'John', email: 'john@example.com' };
      
      const result = validateTemplateVariables(templateVariables, provided);
      
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should return invalid when required variables are missing', () => {
      const templateVariables = [
        { name: 'name', description: '', required: true },
        { name: 'email', description: '', required: true },
      ];
      const provided = { name: 'John' };
      
      const result = validateTemplateVariables(templateVariables, provided);
      
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('email');
    });

    it('should allow optional variables to be missing', () => {
      const templateVariables = [
        { name: 'name', description: '', required: true },
        { name: 'location', description: '', required: false },
      ];
      const provided = { name: 'John' };
      
      const result = validateTemplateVariables(templateVariables, provided);
      
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should handle template with no variables defined', () => {
      const templateVariables = null;
      const provided = {};
      
      const result = validateTemplateVariables(templateVariables, provided);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('DEFAULT_TEMPLATES', () => {
    it('should have all required template types', () => {
      const types = DEFAULT_TEMPLATES.map(t => t.type);
      
      expect(types).toContain('WELCOME');
      expect(types).toContain('PASSWORD_RESET');
      expect(types).toContain('EVENT_REMINDER');
      expect(types).toContain('ANNOUNCEMENT');
      expect(types).toContain('ATTENDANCE_SUMMARY');
    });

    it('should have valid template structure', () => {
      for (const template of DEFAULT_TEMPLATES) {
        expect(template.name).toBeTruthy();
        expect(template.subject).toBeTruthy();
        expect(template.body).toBeTruthy();
        expect(template.variables).toBeInstanceOf(Array);
      }
    });

    it('should have required variables defined for each template', () => {
      for (const template of DEFAULT_TEMPLATES) {
        const extractedVars = extractTemplateVariables(
          `${template.subject} ${template.body}`
        );
        const definedVars = template.variables?.map(v => v.name) || [];
        
        // All extracted variables should be defined
        for (const varName of extractedVars) {
          // Skip conditional variables (they might not be in the variables array)
          const inSubject = template.subject.includes(`{{#if ${varName}}}`);
          const inBody = template.body.includes(`{{#if ${varName}}}`);
          if (!inSubject && !inBody) {
            expect(definedVars).toContain(varName);
          }
        }
      }
    });

    it('welcome template should have expected variables', () => {
      const welcome = DEFAULT_TEMPLATES.find(t => t.type === 'WELCOME');
      expect(welcome).toBeDefined();
      
      const varNames = welcome?.variables?.map(v => v.name) || [];
      expect(varNames).toContain('firstName');
      expect(varNames).toContain('organizationName');
      expect(varNames).toContain('loginUrl');
    });

    it('password reset template should have expected variables', () => {
      const reset = DEFAULT_TEMPLATES.find(t => t.type === 'PASSWORD_RESET');
      expect(reset).toBeDefined();
      
      const varNames = reset?.variables?.map(v => v.name) || [];
      expect(varNames).toContain('firstName');
      expect(varNames).toContain('resetUrl');
      expect(varNames).toContain('expirationTime');
    });

    it('event reminder template should have expected variables', () => {
      const reminder = DEFAULT_TEMPLATES.find(t => t.type === 'EVENT_REMINDER');
      expect(reminder).toBeDefined();
      
      const varNames = reminder?.variables?.map(v => v.name) || [];
      expect(varNames).toContain('firstName');
      expect(varNames).toContain('eventTitle');
      expect(varNames).toContain('eventDate');
      expect(varNames).toContain('eventTime');
    });
  });
});
