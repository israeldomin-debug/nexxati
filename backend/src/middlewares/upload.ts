import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(new Error('Apenas arquivos PDF, JPG, PNG ou GIF são permitidos'));
};

const minUploadLimit = 25 * 1024 * 1024; // 25 MB
const configuredUploadLimit = Number(process.env.MAX_FILE_SIZE || 0);
export const maxUploadFileSize = Math.max(configuredUploadLimit || minUploadLimit, minUploadLimit);

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxUploadFileSize,
  },
});

const fileHash = (filePath: string) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex');

/**
 * Reutiliza um arquivo já existente quando o conteúdo enviado é idêntico.
 * Imagens novas recebem um nome baseado no SHA-256, então o mesmo arquivo não
 * volta a ser duplicado mesmo quando é usado por vários itens de estoque.
 */
export const reuseIdenticalUpload = (
  file: Express.Multer.File,
  targetDir = uploadDir,
  reusableFilenames: Iterable<string> = [],
): string => {
  const uploadedPath = file.path;
  const uploadedStat = fs.statSync(uploadedPath);
  const hash = fileHash(uploadedPath);
  const extension = path.extname(file.originalname).toLowerCase() || path.extname(file.filename).toLowerCase();
  const contentFilename = `image-${hash}${extension}`;
  const contentPath = path.join(targetDir, contentFilename);

  if (fs.existsSync(contentPath) && path.resolve(contentPath) !== path.resolve(uploadedPath)) {
    fs.unlinkSync(uploadedPath);
    return contentFilename;
  }

  const existing = Array.from(new Set(reusableFilenames)).find((filename) => {
    if (!filename || filename === file.filename) return false;
    const candidatePath = path.join(targetDir, path.basename(filename));
    if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) return false;
    if (fs.statSync(candidatePath).size !== uploadedStat.size) return false;
    return fileHash(candidatePath) === hash;
  });

  if (existing) {
    fs.unlinkSync(uploadedPath);
    return path.basename(existing);
  }

  if (path.resolve(uploadedPath) !== path.resolve(contentPath)) {
    fs.renameSync(uploadedPath, contentPath);
  }
  return contentFilename;
};

export const deleteFile = (filename: string): void => {
  const filePath = path.join(uploadDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};
