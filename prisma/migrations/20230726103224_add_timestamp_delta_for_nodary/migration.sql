/*
  Warnings:

  - Added the required column `nodaryTimestampDelta` to the `NodaryApiValues` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "NodaryApiValues" ADD COLUMN     "nodaryTimestampDelta" INTEGER NOT NULL;
