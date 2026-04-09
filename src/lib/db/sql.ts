import { Prisma } from "@prisma/client";

export const sql = Prisma.sql;
export const join = Prisma.join;
export const raw = Prisma.raw;

export type Sql = Prisma.Sql;
