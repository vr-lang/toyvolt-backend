import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
  title: z.string().max(120, 'Title cannot exceed 120 characters').optional().default(''),
  comment: z.string().min(5, 'Review comment must be at least 5 characters').max(2000, 'Review comment cannot exceed 2000 characters')
});

export const updateReviewStatusSchema = z.object({
  status: z.string().transform(val => val.toUpperCase()).pipe(
    z.enum(['PUBLISHED', 'PENDING', 'FLAGGED', 'ARCHIVED'])
  )
});

export const replyReviewSchema = z.object({
  reply: z.string().min(2, 'Reply text is required').max(1000, 'Reply cannot exceed 1000 characters')
});
