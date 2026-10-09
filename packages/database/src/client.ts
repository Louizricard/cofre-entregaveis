import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';
export { Prisma } from '../generated/client/client.js';

export function createDatabase(url: string) {
  const parsed = new URL(url);
  const schema = parsed.searchParams.get('schema') ?? 'public';
  // Prisma CLI reads ?schema from the URL; adapter-pg requires an explicit option.
  // This keeps runtime queries in the same isolated schema as test migrations.
  parsed.searchParams.delete('schema');
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: parsed.href, connectionTimeoutMillis: 3000 },
      { schema },
    ),
  });
}
export type Database = ReturnType<typeof createDatabase>;
