// supabase/functions/_shared/log.ts
type Lvl = 'INFO'|'WARN'|'ERROR'|'DEBUG';
export function logStructured(level: Lvl, message: string, fields: Record<string, any> = {}) {
  console.log(JSON.stringify({ level, message, ...fields, ts: new Date().toISOString() }));
}