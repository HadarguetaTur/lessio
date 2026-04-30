import { z } from 'zod'

export const globalSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'query_too_short')
    .max(80, 'query_too_long'),
})

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>
