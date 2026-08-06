export const PHOTO_ASPECT_RATIO = 4 / 3;
export const MIN_SHARPNESS_SCORE = 20;

export interface CropPosition {
  zoom: number;
  x: number;
  y: number;
}

export interface PixelCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function loadImage(source: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function cropBounds(width: number, height: number, position: CropPosition) {
  const baseWidth = width / height > PHOTO_ASPECT_RATIO ? height * PHOTO_ASPECT_RATIO : width;
  const baseHeight = baseWidth / PHOTO_ASPECT_RATIO;
  const cropWidth = baseWidth / position.zoom;
  const cropHeight = baseHeight / position.zoom;
  return {
    x: (width - cropWidth) * ((position.x + 1) / 2),
    y: (height - cropHeight) * ((position.y + 1) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

export async function cropPhoto(source: Blob, position: CropPosition): Promise<File> {
  const image = await loadImage(source);
  const bounds = cropBounds(image.naturalWidth, image.naturalHeight, position);
  const outputWidth = Math.min(1600, Math.max(800, Math.round(bounds.width)));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = Math.round(outputWidth / PHOTO_ASPECT_RATIO);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Thiết bị không hỗ trợ xử lý ảnh.');
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Không thể tạo ảnh đã cắt.')), 'image/jpeg', 0.92));
  return new File([blob], `qc-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

export async function cropPhotoArea(source: Blob, area: PixelCropArea): Promise<File> {
  const image = await loadImage(source);
  const outputWidth = Math.min(1280, Math.max(800, Math.round(area.width)));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = Math.round(outputWidth * area.height / area.width);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Thiết bị không hỗ trợ xử lý ảnh.');
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Không thể tạo ảnh đã cắt.')), 'image/jpeg', 0.9));
  return new File([blob], `qc-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

export async function calculateSharpness(source: Blob): Promise<number> {
  const image = await loadImage(source);
  const scale = Math.min(1, 480 / image.naturalWidth);
  const width = Math.max(3, Math.round(image.naturalWidth * scale));
  const height = Math.max(3, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Thiết bị không hỗ trợ kiểm tra độ nét.');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  const luminance = (index: number) => 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const laplacian = 4 * luminance(index) - luminance(index - 4) - luminance(index + 4) - luminance(index - width * 4) - luminance(index + width * 4);
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }
  return count ? Math.max(0, sumSquares / count - (sum / count) ** 2) : 0;
}
