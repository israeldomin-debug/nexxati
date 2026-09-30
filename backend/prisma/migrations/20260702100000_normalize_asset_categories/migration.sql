UPDATE "assets"
SET "category" = 'Câmera'
WHERE "category" IN ('Câmera', 'Camera', 'CAMERA');

UPDATE "assets"
SET "type" = 'CAMERA'
WHERE "category" = 'Câmera';

UPDATE "assets"
SET "category" = 'DVR / NVR'
WHERE "category" IN ('DVR / NVR', 'DVR NVR', 'DVR_NVR', 'DVR', 'NVR');

UPDATE "assets"
SET "type" = 'DVR_NVR'
WHERE "category" = 'DVR / NVR'
  AND "type" <> 'CAMERA';
