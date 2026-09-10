import { createServerFn } from '@tanstack/react-start';

export const getControlRoomModel = createServerFn({ method: 'POST' })
  .inputValidator((data: { editionId?: string }) => {
    const editionId = data?.editionId?.trim();
    if (!editionId) throw new Error('Edition id is required');
    return { editionId };
  })
  .handler(async ({ data }) => {
    const { loadControlRoomModelServer } = await import('./control-room.server');
    return loadControlRoomModelServer(data.editionId);
  });
