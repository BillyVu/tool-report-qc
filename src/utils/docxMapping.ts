import { DocxMapping, InspectionStep } from '../types/qc';

const PLACEHOLDER_PATTERN = /^\{\{[a-z][a-z0-9_]*\}\}$/i;

function isValidPlaceholder(value: string | undefined): boolean {
  return !!value?.trim() && PLACEHOLDER_PATTERN.test(value.trim());
}

export function hasCompleteWordMapping(step: InspectionStep): boolean {
  return isValidPlaceholder(step.mapping?.imageTag)
    && isValidPlaceholder(step.mapping?.noteTag)
    && (!step.mapping?.statusTag || isValidPlaceholder(step.mapping.statusTag));
}

export function getWordMappingSummary(step: InspectionStep): string {
  return hasCompleteWordMapping(step) ? 'Mapping Word OK' : 'Thiếu mapping Word';
}

export function validateDocxMapping(mapping: DocxMapping): string[] {
  const fields: Array<[keyof DocxMapping, string, boolean]> = [
    ['imageTag', 'Thẻ hình ảnh', true],
    ['noteTag', 'Thẻ ghi chú', true],
    ['statusTag', 'Thẻ trạng thái', false],
  ];

  return fields.flatMap(([field, label, required]) => {
    const value = String(mapping[field] || '').trim();
    if (!value) return required ? [`${label} là bắt buộc.`] : [];
    return PLACEHOLDER_PATTERN.test(value)
      ? []
      : [`${label} phải có dạng {{ten_the}} và chỉ dùng chữ, số, dấu gạch dưới.`];
  });
}

export function validateTemplateMappings(steps: InspectionStep[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();

  steps.forEach((step, index) => {
    const label = `${step.stepId || `STEP_${index + 1}`} - ${step.title || `Bước ${index + 1}`}`;
    const mapping = step.mapping;
    if (!mapping) {
      errors.push(`${label}: chưa cấu hình mapping Word.`);
      return;
    }

    validateDocxMapping(mapping).forEach((error) => errors.push(`${label}: ${error}`));

    [mapping.imageTag, mapping.noteTag, mapping.statusTag].forEach((rawTag) => {
      const tag = rawTag?.trim();
      if (!tag) return;
      const firstStep = seen.get(tag);
      if (firstStep && firstStep !== label) {
        errors.push(`${label}: tag ${tag} bị trùng với ${firstStep}.`);
      } else {
        seen.set(tag, label);
      }
    });
  });

  return errors;
}
