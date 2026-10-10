-- Attachment bytes may live in object storage instead of the row.
ALTER TABLE "Attachment" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_bytes_in_one_place"
  CHECK (("data" IS NULL) <> ("storageKey" IS NULL));
