import { useEffect, useRef, useState } from 'react';
import { Download, Eye, File as FileIcon, FileImage, Upload, X } from 'lucide-react';

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
  maxSize?: number;
}

const acceptedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
const acceptedExtensions = '.pdf,.jpg,.jpeg,.png,.gif';

const isImageFile = (filename: string) => /\.(jpe?g|png|gif)$/i.test(filename);

export function FileUpload({ onUpload, isUploading = false, maxSize = 5 }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    if (!acceptedMimeTypes.includes(file.type)) {
      setError('Apenas arquivos PDF, JPG, PNG ou GIF são permitidos');
      return false;
    }

    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > maxSize) {
      setError(`O arquivo deve ter no máximo ${maxSize}MB`);
      return false;
    }

    setError(null);
    return true;
  };

  const handleFile = async (file: File) => {
    if (!validateFile(file)) return;

    try {
      await onUpload(file);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer upload do arquivo');
    }
  };

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === 'dragenter' || event.type === 'dragover');
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files?.[0]) {
      await handleFile(event.dataTransfer.files[0]);
    }
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (event.target.files?.[0]) {
      await handleFile(event.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        className={`relative rounded-lg border-2 border-dashed p-6 transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        } ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={acceptedExtensions}
          onChange={handleChange}
          disabled={isUploading}
        />

        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              {isUploading ? 'Enviando arquivo...' : 'Clique ou arraste PDF, JPG, PNG ou GIF'}
            </p>
            <p className="mt-1 text-xs text-gray-500">Tamanho máximo: {maxSize}MB</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
          <X className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

interface AttachmentListProps {
  attachments: Array<{ filename: string; originalname?: string }>;
  onDownload: (filename: string) => void;
  onDelete?: (filename: string) => void;
  onPreviewImage?: (url: string, filename: string) => void;
  getPreviewUrl?: (filename: string) => Promise<string>;
  canDelete?: boolean;
}

export function AttachmentList({
  attachments,
  onDownload,
  onDelete,
  onPreviewImage,
  getPreviewUrl,
  canDelete = false,
}: AttachmentListProps) {
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    const loadPreviews = async () => {
      if (!getPreviewUrl) {
        setPreviewUrls({});
        return;
      }

      const images = attachments.filter((attachment) => isImageFile(attachment.filename));
      const entries = await Promise.all(images.map(async (attachment) => {
        try {
          const url = await getPreviewUrl(attachment.filename);
          objectUrls.push(url);
          return [attachment.filename, url] as const;
        } catch {
          return null;
        }
      }));

      if (!cancelled) {
        setPreviewUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>));
      }
    };

    loadPreviews();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachments, getPreviewUrl]);

  if (attachments.length === 0) {
    return <div className="text-sm italic text-gray-500">Nenhum anexo neste ticket</div>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {attachments.map((attachment) => {
        const displayName = attachment.originalname || attachment.filename;
        const image = isImageFile(attachment.filename);
        const previewUrl = previewUrls[attachment.filename];

        return (
          <div key={attachment.filename} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => image && previewUrl && onPreviewImage?.(previewUrl, displayName)}
                disabled={!image || !previewUrl}
                className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white ${
                  image && previewUrl ? 'cursor-zoom-in hover:ring-2 hover:ring-blue-200' : ''
                }`}
                aria-label={image ? `Visualizar ${displayName}` : displayName}
              >
                {image && previewUrl ? (
                  <img src={previewUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : image ? (
                  <FileImage className="h-6 w-6 text-blue-500" />
                ) : (
                  <FileIcon className="h-6 w-6 text-red-500" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700">{displayName}</p>
                <p className="mt-1 text-xs text-gray-500">{image ? 'Imagem' : 'PDF'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {image && previewUrl && onPreviewImage && (
                    <button onClick={() => onPreviewImage(previewUrl, displayName)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
                      <Eye size={15} /> Visualizar
                    </button>
                  )}
                  <button onClick={() => onDownload(attachment.filename)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
                    <Download size={15} /> Baixar
                  </button>
                  {canDelete && onDelete && (
                    <button onClick={() => onDelete(attachment.filename)} className="text-sm font-medium text-red-600 hover:text-red-700">
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
