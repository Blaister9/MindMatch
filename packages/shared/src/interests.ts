import { z } from "zod";

export const interestSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
export type Interest = z.infer<typeof interestSchema>;

export const listInterestsResponseSchema = z.object({
  interests: z.array(interestSchema),
});
export type ListInterestsResponse = z.infer<typeof listInterestsResponseSchema>;
