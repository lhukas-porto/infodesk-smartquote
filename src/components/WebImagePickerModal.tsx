import React from 'react';

export interface WebImagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  initialImages?: string[];
  currentImageUrl?: string;
  onSelectImage: (imageUrl: string) => void;
}

export const WebImagePickerModal: React.FC<WebImagePickerModalProps> = () => null;
