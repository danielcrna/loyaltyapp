// Verificación de salud ligera: no consulta la base de datos (así Neon puede "dormir" y no gasta horas de cómputo).
// Úsala para el health check de Render y para el ping que mantiene despierto el servidor gratuito.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() });
}
