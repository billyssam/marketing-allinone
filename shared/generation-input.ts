import { z } from 'zod';
import { CONTENT_CHANNELS, type ChannelId } from './channels/registry';

export const generationInput = z.object({
  storeId: z.string().uuid().optional(),
  channels: z.array(z.string().refine((id) => CONTENT_CHANNELS.includes(id as never)))
    .max(9).transform((ids) => [...new Set(ids)] as ChannelId[]).optional(),
  targetLength: z.enum(['short', 'medium', 'long']).optional(),
  angle: z.string().trim().max(2000).optional(),
  photos: z.array(z.object({
    storagePath: z.string().min(1).max(2048), userNote: z.string().max(500).optional(),
    exif: z.object({ takenAt: z.string().max(40).optional(), lat: z.number().finite().min(-90).max(90).optional(),
      lng: z.number().finite().min(-180).max(180).optional() }).optional(),
  })).max(12).optional(),
});
