import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Transaction } from "../matching/types";

function lockKey(value: string): bigint {
  const bytes = createHash("sha256").update(value).digest();
  return bytes.readBigInt64BE(0);
}

export async function advisoryTransactionLock(tx: Transaction, scope: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${lockKey(scope)})`);
}
