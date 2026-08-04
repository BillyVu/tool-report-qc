import { randomUUID } from 'node:crypto';
import { toJsonbParam } from './jsonParam.js';

export interface ChecklistTemplatePayload {
  id?: string;
  title?: string;
  productCode?: string;
  productName?: string;
  docxTemplateName?: string;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
  steps?: unknown[];
}

export interface TemplateRow {
  external_id: string;
  title: string;
  product_code: string;
  product_name: string;
  version: string;
  definition: ChecklistTemplatePayload | string;
  created_at: string | Date;
  updated_at: string | Date;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function definitionObject(definition: TemplateRow['definition']): ChecklistTemplatePayload {
  if (typeof definition === 'string') return JSON.parse(definition);
  return definition || {};
}

export function serializeTemplateRow(row: TemplateRow): Required<ChecklistTemplatePayload> {
  const definition = definitionObject(row.definition);
  return {
    id: row.external_id,
    title: row.title,
    productCode: row.product_code,
    productName: row.product_name,
    docxTemplateName: definition.docxTemplateName || '',
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    steps: Array.isArray(definition.steps) ? definition.steps : [],
  };
}

export function templateDbParams(template: ChecklistTemplatePayload, externalId = template.id || `TMPL-${randomUUID()}`) {
  const title = template.title?.trim();
  const productCode = template.productCode?.trim();
  if (!title) throw new Error('title is required.');
  if (!productCode) throw new Error('productCode is required.');
  if (!Array.isArray(template.steps)) throw new Error('steps must be an array.');

  const productName = template.productName?.trim() || title;
  const version = template.version?.trim() || '1.0.0';
  const definition = {
    docxTemplateName: template.docxTemplateName?.trim() || 'Mau_Bao_Cao_QC_Chuan.docx',
    steps: template.steps,
  };

  return {
    externalId,
    title,
    productCode,
    productName,
    version,
    definitionJson: toJsonbParam(definition),
  };
}
