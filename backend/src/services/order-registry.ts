import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export async function registerOrderNumber(
  tx: Prisma.TransactionClient,
  numeroOrden: string,
): Promise<void> {
  try {
    await tx.ordenes_registradas.create({
      data: { numero_orden: numeroOrden },
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `La orden ${numeroOrden} ya fue registrada anteriormente y no se puede repetir.`,
      );
    }
    throw error;
  }
}
