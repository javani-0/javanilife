import { useState } from "react";
import { getCloudinaryUrl } from "@/lib/cloudinary";

interface CloudinaryImageProps {
  publicId: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  transforms?: string;
}

const CloudinaryImage = ({ publicId, alt, width, height, className = "", transforms }: CloudinaryImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const src = getCloudinaryUrl(publicId, transforms);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && <div className="absolute inset-0 skeleton-shimmer" />}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
};

export default CloudinaryImage;
