-- AlterTable
ALTER TABLE "BeaconSetEvents" ADD COLUMN     "inBeaconSet" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NodaryApiValues" ADD COLUMN     "inBeaconSet" BOOLEAN NOT NULL DEFAULT false;
