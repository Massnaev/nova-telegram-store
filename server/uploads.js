import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { ApiError } from './errors.js';

const serverDir = dirname(fileURLToPath(import.meta.url));
export const defaultUploadDirectory = resolve(serverDir, '..', 'uploads', 'products');

const types = {
  'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', signature: (buffer) => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' },
};

export function createImageUploadService(uploadDirectory = defaultUploadDirectory) {
  mkdirSync(uploadDirectory, { recursive: true });

  const middleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(_request, file, callback) {
      if (!types[file.mimetype]) return callback(new ApiError('Разрешены только JPG, PNG и WebP', 422, 'IMAGE_TYPE_NOT_ALLOWED'));
      return callback(null, true);
    },
  }).single('image');

  function save(file) {
    if (!file) throw new ApiError('Выберите изображение', 422, 'IMAGE_REQUIRED');
    const type = types[file.mimetype];
    if (!type?.signature(file.buffer)) throw new ApiError('Файл не является корректным изображением', 422, 'INVALID_IMAGE');
    const filename = `${randomUUID()}.${type.extension}`;
    writeFileSync(resolve(uploadDirectory, filename), file.buffer, { flag: 'wx' });
    return { imageUrl: `/uploads/products/${filename}` };
  }

  function remove(imageUrl) {
    const prefix = '/uploads/products/';
    if (!imageUrl.startsWith(prefix)) throw new ApiError('Некорректный путь изображения', 422, 'INVALID_IMAGE_PATH');
    const filename = imageUrl.slice(prefix.length);
    if (basename(filename) !== filename || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) {
      throw new ApiError('Некорректный путь изображения', 422, 'INVALID_IMAGE_PATH');
    }
    const target = resolve(uploadDirectory, filename);
    if (dirname(target) !== resolve(uploadDirectory)) throw new ApiError('Некорректный путь изображения', 422, 'INVALID_IMAGE_PATH');
    if (existsSync(target)) unlinkSync(target);
  }

  return { middleware, save, remove, uploadDirectory };
}
