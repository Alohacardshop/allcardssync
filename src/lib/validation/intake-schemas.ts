import { z } from 'zod';

/**
 * Raw Card Intake Validation Schema
 * Protects against malicious input, DoS attacks, and data corruption
 */
export const rawCardSchema = z.object({
  brand: z.string()
    .trim()
    .min(1, { message: "Brand/Set is required" })
    .max(100, { message: "Brand/Set must be less than 100 characters" }),
  
  subject: z.string()
    .trim()
    .min(1, { message: "Card name is required" })
    .max(200, { message: "Card name must be less than 200 characters" }),
  
  cardNumber: z.string()
    .trim()
    .max(50, { message: "Card number must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  
  condition: z.string()
    .trim()
    .max(50, { message: "Condition must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  
  price: z.string()
    .refine((val) => {
      if (!val) return true; // Allow empty
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 999999;
    }, { message: "Price must be a valid number between 0 and 999,999" }),
  
  notes: z.string()
    .max(1000, { message: "Notes must be less than 1000 characters" })
    .optional()
    .or(z.literal("")),
});

/**
 * Graded Card Intake Validation Schema
 * Validates PSA/graded card data before database operations
 */
export const gradedCardSchema = z.object({
  brandTitle: z.string()
    .trim()
    .min(1, { message: "Brand/Set is required" })
    .max(100, { message: "Brand/Set must be less than 100 characters" }),
  
  subject: z.string()
    .trim()
    .min(1, { message: "Card name is required" })
    .max(200, { message: "Card name must be less than 200 characters" }),
  
  category: z.string()
    .trim()
    .max(100, { message: "Category must be less than 100 characters" })
    .optional()
    .or(z.literal("")),
  
  variant: z.string()
    .trim()
    .max(50, { message: "Variant must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  
  cardNumber: z.string()
    .trim()
    .max(50, { message: "Card number must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  
  year: z.string()
    .trim()
    .max(10, { message: "Year must be less than 10 characters" })
    .optional()
    .or(z.literal("")),
  
  certNumber: z.string()
    .trim()
    .regex(/^\d{1,12}$/, { message: "Certificate number must be 1-12 digits only" })
    .optional()
    .or(z.literal("")),
  
  grade: z.string()
    .trim()
    .max(20, { message: "Grade must be less than 20 characters" })
    .optional()
    .or(z.literal("")),
  
  price: z.string()
    .refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 999999;
    }, { message: "Price must be a valid number between 0 and 999,999" }),
  
  cost: z.string()
    .refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 999999;
    }, { message: "Cost must be a valid number between 0 and 999,999" })
    .optional()
    .or(z.literal("")),
  
  quantity: z.number()
    .int({ message: "Quantity must be a whole number" })
    .min(1, { message: "Quantity must be at least 1" })
    .max(1000, { message: "Quantity cannot exceed 1000" }),
  
  psaEstimate: z.string()
    .max(50, { message: "PSA estimate must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  
  varietyPedigree: z.string()
    .max(200, { message: "Variety/Pedigree must be less than 200 characters" })
    .optional()
    .or(z.literal("")),
});

export type RawCardInput = z.infer<typeof rawCardSchema>;
export type GradedCardInput = z.infer<typeof gradedCardSchema>;
