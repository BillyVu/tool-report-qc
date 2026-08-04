const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function imageUploadFilter(file: { mimetype: string }): boolean {
  return ALLOWED_IMAGE_TYPES.has(file.mimetype);
}
