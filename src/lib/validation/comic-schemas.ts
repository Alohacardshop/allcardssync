import { z } from 'zod';

export const rawComicSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  issueNumber: z.string().max(50).optional(),
  publisher: z.string().max(100).optional(),
  year: z.string().regex(/^\d{4}$/, "Invalid year").optional().or(z.literal("")),
  condition: z.string().optional(),
  price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Price must be a positive number"
  }),
  cost: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
    message: "Cost must be a non-negative number"
  }),
  quantity: z.number().int().positive().default(1),
  mainCategory: z.literal('comics'),
  subCategory: z.string().min(1, "Sub-category is required"),
  processingNotes: z.string().max(1000).optional()
});

export const gradedComicSchema = z.object({
  certNumber: z.string().min(1, "Certificate number is required"),
  grade: z.string().min(1, "Grade is required"),
  title: z.string().min(1, "Title is required"),
  issueNumber: z.string().optional(),
  publisher: z.string().optional(),
  year: z.string().optional(),
  price: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
    message: "Price must be a positive number"
  }),
  cost: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
    message: "Cost must be a non-negative number"
  }),
  quantity: z.number().int().positive().default(1),
  mainCategory: z.literal('comics')
});
