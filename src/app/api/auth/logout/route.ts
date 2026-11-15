import { route } from '@/lib/api';
import { endSession } from '@/lib/auth';

export const POST = route(async () => { await endSession('customer'); return { ok: true }; });
