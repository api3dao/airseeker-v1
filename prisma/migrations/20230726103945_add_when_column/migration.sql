/*
  Warnings:

  - Added the required column `when` to the `NodaryApiValues` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "NodaryApiValues" ADD COLUMN     "when" TIMESTAMP(3) NOT NULL;