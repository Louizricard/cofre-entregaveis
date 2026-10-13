import { ConflictException } from '@nestjs/common';
import { Prisma, type Database } from '@cofre/database';

export async function serial<T>(db: Database, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
 for (let attempt = 0; attempt < 8; attempt++) {
  try { return await db.$transaction(action, { isolationLevel: 'Serializable' }); }
  catch (error) {
   if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
  }
 }
 throw new ConflictException({ code: 'CONCURRENT_CHANGE', message: 'Outra alteração está em andamento. Tente novamente.' });
}
