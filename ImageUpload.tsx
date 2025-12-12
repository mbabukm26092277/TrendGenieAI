import React, { useRef, useState } from 'react';
import { Camera, Upload, Image as ImageIcon } from 'lucide-react';

interface ImageUploadProps {
  onImageSelected: (base64: string) => void;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onImageSelected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      onImageSelected(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6">
      <div
        className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer bg-slate-800 ${
          isDragOver ? 'border-brand-500 bg-slate-700' : 'border-slate-600 hover:border-brand-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="bg-slate-700 p-4 rounded-full mb-4">
          <ImageIcon className="w-8 h-8 text-brand-500" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-white">Upload your photo</h3>
        <p className="text-slate-400 text-center mb-6">Drag & drop or click to browse</p>
        
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />

        <div className="flex gap-4">
          <button className="flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-white font-medium transition-colors">
            <Upload className="w-4 h-4" />
            Select File
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500">Supports JPG, PNG (Max 5MB)</p>
      </div>
    </div>
  );
};