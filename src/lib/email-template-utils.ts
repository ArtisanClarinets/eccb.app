/**
 * Email Template Utilities
 * 
 * These utilities can be used in both client and server components.
 * They don't depend on Prisma or other server-only modules.
 */

// ====================================
// Types
// ====================================

export interface TemplateVariable {
  name: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text?: string;
}

// ====================================
// Variable Substitution
// ====================================

/**
 * Substitute variables in a template string
 * Supports {{variable}} syntax and {{#if variable}}...{{/if}} conditionals
 */
export function substituteVariables(template: string, variables: Record<string, unknown>): string {
  let result = template;

  // Handle conditionals first: {{#if variable}}content{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_match, varName, content) => {
    const value = variables[varName];
    // Check if the variable is truthy (not null, undefined, empty string, or false)
    if (value !== null && value !== undefined && value !== '' && value !== false) {
      return content;
    }
    return '';
  });

  // Replace simple variables: {{variable}}
  const variableRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(variableRegex, (_match, varName) => {
    const value = variables[varName];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });

  return result;
}

/**
 * Extract variable names from a template
 */
export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  
  // Extract simple variables: {{variable}}
  const variableRegex = /\{\{(\w+)\}\}/g;
  let match;
  while ((match = variableRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  // Extract conditional variables: {{#if variable}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}/g;
  while ((match = conditionalRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Validate that all required variables are provided
 */
export function validateTemplateVariables(
  templateVariables: TemplateVariable[] | null,
  providedVariables: Record<string, unknown>
): { valid: boolean; missing: string[] } {
  if (!templateVariables) {
    return { valid: true, missing: [] };
  }

  const missing: string[] = [];
  for (const tv of templateVariables) {
    if (tv.required && (providedVariables[tv.name] === undefined || providedVariables[tv.name] === null)) {
      missing.push(tv.name);
    }
  }

  return { valid: missing.length === 0, missing };
}
