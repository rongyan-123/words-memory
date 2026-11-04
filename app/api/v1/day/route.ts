import { handle } from '@/src/server/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handle('day', request); }
