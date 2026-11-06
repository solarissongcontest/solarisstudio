import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getPublicShowCalendar = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => z.object({
    editionSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/).nullable(),
  }).parse(input))
  .handler(async ({ data }) => {
    const { loadPublicShowCalendar } = await import('@/integrations/v3/public-show-calendar.server');
    return loadPublicShowCalendar(data.editionSlug);
  });
