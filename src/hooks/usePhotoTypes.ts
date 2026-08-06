import { useEffect, useState } from 'react';
import { DEFAULT_PHOTO_TYPE_OPTIONS, PhotoTypeOption } from '../constants/photoTypes';
import { listPublicPhotoTypes } from '../services/photoTypesApi';

export function usePhotoTypes() {
  const [photoTypes, setPhotoTypes] = useState<PhotoTypeOption[]>(DEFAULT_PHOTO_TYPE_OPTIONS);

  useEffect(() => {
    let isActive = true;
    void listPublicPhotoTypes().then((items) => {
      if (isActive) setPhotoTypes(items);
    });
    return () => {
      isActive = false;
    };
  }, []);

  return photoTypes;
}
