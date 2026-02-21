import { describe, it, expect } from 'vitest';
import {
  substituteVariables,
  extractTemplateVariables,
  validateTemplateVariables,
  type TemplateVariable
} from '../email-template-utils';

describe('Email Template Utilities', () => {
  describe('substituteVariables', () => {
    it('should substitute simple variables', () => {
      const template = 'Hello {{name}}!';
      const variables = { name: 'World' };
      expect(substituteVariables(template, variables)).toBe('Hello World!');
    });

    it('should substitute multiple variables', () => {
      const template = 'Hello {{firstName}} {{lastName}}!';
      const variables = { firstName: 'John', lastName: 'Doe' };
      expect(substituteVariables(template, variables)).toBe('Hello John Doe!');
    });

    it('should replace missing variables with empty string', () => {
      const template = 'Hello {{name}}! Welcome to {{place}}.';
      const variables = { name: 'John' };
      expect(substituteVariables(template, variables)).toBe('Hello John! Welcome to .');
    });

    it('should handle truthy conditionals', () => {
      const template = '{{#if show}}This is visible{{/if}}';
      expect(substituteVariables(template, { show: true })).toBe('This is visible');
      expect(substituteVariables(template, { show: 'yes' })).toBe('This is visible');
      expect(substituteVariables(template, { show: 1 })).toBe('This is visible');
    });

    it('should handle falsy conditionals', () => {
      const template = '{{#if show}}This is visible{{/if}}';
      expect(substituteVariables(template, { show: false })).toBe('');
      expect(substituteVariables(template, { show: null })).toBe('');
      expect(substituteVariables(template, { show: undefined })).toBe('');
      expect(substituteVariables(template, { show: '' })).toBe('');
    });

    it('should handle mixed variables and conditionals', () => {
      const template = 'Hello {{name}}!{{#if member}} Welcome back!{{/if}}';
      expect(substituteVariables(template, { name: 'John', member: true })).toBe('Hello John! Welcome back!');
      expect(substituteVariables(template, { name: 'Jane', member: false })).toBe('Hello Jane!');
    });

    it('should handle multiple conditionals', () => {
      const template = '{{#if a}}A{{/if}}{{#if b}}B{{/if}}';
      expect(substituteVariables(template, { a: true, b: true })).toBe('AB');
      expect(substituteVariables(template, { a: true, b: false })).toBe('A');
      expect(substituteVariables(template, { a: false, b: true })).toBe('B');
    });

    it('should handle variables inside conditionals', () => {
      const template = '{{#if show}}Value is {{val}}{{/if}}';
      expect(substituteVariables(template, { show: true, val: 'foo' })).toBe('Value is foo');
      expect(substituteVariables(template, { show: false, val: 'foo' })).toBe('');
    });
  });

  describe('extractTemplateVariables', () => {
    it('should extract simple variables', () => {
      const template = 'Hello {{name}}! Welcome to {{place}}.';
      const result = extractTemplateVariables(template);
      expect(result).toContain('name');
      expect(result).toContain('place');
      expect(result).toHaveLength(2);
    });

    it('should extract conditional variables', () => {
      const template = '{{#if show}}Content{{/if}}';
      const result = extractTemplateVariables(template);
      expect(result).toEqual(['show']);
    });

    it('should extract unique variables from both', () => {
      const template = '{{#if show}}Hello {{name}}!{{/if}}{{name}}';
      const result = extractTemplateVariables(template);
      expect(result).toContain('show');
      expect(result).toContain('name');
      expect(result).toHaveLength(2);
    });

    it('should return empty array if no variables found', () => {
      const template = 'No variables here.';
      const result = extractTemplateVariables(template);
      expect(result).toEqual([]);
    });
  });

  describe('validateTemplateVariables', () => {
    const definitions: TemplateVariable[] = [
      { name: 'name', required: true },
      { name: 'optional', required: false },
      { name: 'email', required: true }
    ];

    it('should return valid if all required variables are provided', () => {
      const provided = { name: 'John', email: 'john@example.com' };
      const result = validateTemplateVariables(definitions, provided);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return missing variables if required ones are absent', () => {
      const provided = { name: 'John' };
      const result = validateTemplateVariables(definitions, provided);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['email']);
    });

    it('should return missing if required variable is null or undefined', () => {
      const provided = { name: 'John', email: null };
      const result = validateTemplateVariables(definitions, provided);
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['email']);
    });

    it('should handle null templateVariables', () => {
      const result = validateTemplateVariables(null, { any: 'thing' });
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should ignore non-required variables when missing', () => {
      const provided = { name: 'John', email: 'john@example.com' };
      // 'optional' is missing but not required
      const result = validateTemplateVariables(definitions, provided);
      expect(result.valid).toBe(true);
    });
  });
});
