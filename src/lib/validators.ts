import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string().trim().min(2).max(40),
  email: z.string().trim().email(),
  password: z.string().min(8).max(80),
});

export const createHouseSchema = z.object({
  name: z.string().trim().min(2).max(40),
  welcome: z.string().trim().max(180).optional(),
});

export const joinHouseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .transform((value) => value.toUpperCase()),
  password: z.string().max(80).optional(),
});

export const updateHouseSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  welcome: z.string().trim().max(180).optional(),
  password: z.string().min(4).max(80).nullable().optional(),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(40),
  parentId: z.string().nullable().optional(),
  topic: z.string().trim().max(120).optional(),
  maxUsers: z.number().int().min(2).max(32).optional(),
  password: z.string().min(4).max(80).nullable().optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  parentId: z.string().nullable().optional(),
  topic: z.string().trim().max(120).optional(),
  maxUsers: z.number().int().min(2).max(32).optional(),
  password: z.string().min(4).max(80).nullable().optional(),
  move: z.enum(["up", "down"]).optional(),
});

export const kickSchema = z.object({
  userId: z.string().min(1),
});
