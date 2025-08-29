/**
 * Catalog Migration Sentinel
 * 
 * This file serves as a marker that catalog syncing functionality
 * has been moved to a separate service.
 */

export const catalogMovedMessage = "Catalog syncing moved to Alohacardshop/alohacardshopcarddatabase";

export const catalogMovedDetails = {
  message: catalogMovedMessage,
  newRepository: "Alohacardshop/alohacardshopcarddatabase", 
  migrationDate: "2025-08-29",
  reason: "Catalog operations moved to dedicated external service"
};