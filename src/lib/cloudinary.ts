export const CLOUDINARY_CLOUD_NAME = "dxeyhsuyr";
export const CLOUDINARY_UPLOAD_PRESET = "Javani";

export const getCloudinaryUrl = (publicId: string, transforms?: string) => {
  const base = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const autoOptimize = "f_auto,q_auto";
  const allTransforms = transforms ? `${autoOptimize},${transforms}` : autoOptimize;
  return `${base}/${allTransforms}/${publicId}`;
};

export const getCloudinaryVideoUrl = (publicId: string, transforms?: string) => {
  const base = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload`;
  return transforms ? `${base}/${transforms}/${publicId}` : `${base}/${publicId}`;
};
