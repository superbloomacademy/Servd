import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { flushEmits } from './realtime';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const bad = (msg: string, code?: string) => new ApiError(400, msg, code);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const forbidden = (msg = 'You do not have access to this.') => new ApiError(403, msg);
export const unauthorized = (msg = 'Please log in.') => new ApiError(401, msg);

type Ctx<P> = { params: Promise<P> };

// Wraps a route handler: JSON responses, consistent error shape { error, code }.
export function route<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn(req, params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message || 'Invalid input' }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
    } finally {
      await flushEmits();   // live events must be saved before the reply (serverless hosts stop right after)
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
