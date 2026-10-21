import "server-only";

/** Lee todas las páginas (PostgREST devuelve como máximo 1000 filas por petición) */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let i = 0; ; i += page) {
    const { data, error } = await build(i, i + page - 1);
    if (error) throw new Error(`No se han podido cargar ${what}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}
