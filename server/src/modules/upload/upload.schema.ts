import { z } from 'zod';
import { IMAGE_CONTENT_TYPES, type ImageContentType } from '../../lib/image-file';
import { UPLOAD_MAX_BYTES, UPLOAD_PURPOSES, type UploadPurpose } from './upload-purpose';

export const uploadUrlBody = z.object({
  purpose: z.enum(Object.keys(UPLOAD_PURPOSES) as [UploadPurpose], {
    error: 'INVALID_UPLOAD_PURPOSE',
  }),
  contentType: z.enum(Object.keys(IMAGE_CONTENT_TYPES) as [ImageContentType], {
    error: 'UNSUPPORTED_IMAGE_TYPE',
  }),
  fileSize: z.number().int().positive().max(UPLOAD_MAX_BYTES, { error: 'IMAGE_TOO_LARGE' }),
});
export type UploadUrlBody = z.infer<typeof uploadUrlBody>;
