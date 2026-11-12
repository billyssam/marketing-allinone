import { z } from 'zod';
import { getBusinessType } from './business/taxonomy';
import { CONTENT_CHANNELS } from './channels/registry';

export const offeringInput = z.object({
  name: z.string().trim().max(120),
  price: z.number().finite().min(0).max(1_000_000_000).optional(),
  unit: z.string().trim().max(40).optional(),
  note: z.string().trim().max(300).optional(),
});
const common = {
  industryId: z.string().refine((id) => Boolean(getBusinessType(id))),
  naverPlaceUrl: z.string().max(2048).optional(),
  address: z.string().trim().max(300).optional(),
  offerings: z.array(offeringInput).max(40).transform((items) => items.filter((item) => item.name)).optional(),
};
export const onboardingInput = z.object({
  ...common, storeName: z.string().trim().min(1).max(80),
  channels: z.array(z.string().refine((id) => CONTENT_CHANNELS.includes(id as never))).max(9),
});
export const settingsInput = z.object({
  ...common, name: z.string().trim().min(1).max(80), naverBlogUrl: z.string().max(2048).optional(),
});
