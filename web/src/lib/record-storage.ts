import path from "node:path";
import fs from "node:fs/promises";

export const RECORD_PHOTO_MAX_SIZE = 20 * 1024 * 1024;

export function getRecordStorageBaseDir() {
  return (
    process.env.RECORD_STORAGE_DIR ??
    path.join(process.cwd(), ".data", "records")
  );
}

export function getRecordPhotoRelativePath(
  groupId: number,
  recordId: number,
  photoId: number
) {
  return path.join(String(groupId), String(recordId), String(photoId));
}

export function getRecordPhotoAbsolutePath(
  groupId: number,
  recordId: number,
  photoId: number
) {
  return path.join(
    getRecordStorageBaseDir(),
    getRecordPhotoRelativePath(groupId, recordId, photoId)
  );
}

export async function saveUploadedRecordPhoto(
  groupId: number,
  recordId: number,
  photoId: number,
  file: File
) {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > RECORD_PHOTO_MAX_SIZE) {
    throw new Error("ファイルサイズは20MB以下にしてください。");
  }

  const absolutePath = getRecordPhotoAbsolutePath(groupId, recordId, photoId);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return getRecordPhotoRelativePath(groupId, recordId, photoId);
}
