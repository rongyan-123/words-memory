import { handle } from '@/src/server/http';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handle('marksBatch', request); }
