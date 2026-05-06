import { useState } from "react";
import { getCloudinaryVideoUrl } from "@/lib/cloudinary";

interface CloudinaryVideoProps {
  publicId: string;
  className?: string;
  transforms?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

const CloudinaryVideo = ({ publicId, className = "", transforms, autoPlay = true, loop = true, muted = true }: CloudinaryVideoProps) => {
  const [loaded, setLoaded] = useState(false);
  const src = getCloudinaryVideoUrl(publicId, transforms);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && <div className="absolute inset-0 skeleton-shimmer" />}
      <video
        src={src}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        onLoadedData={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
};

export default CloudinaryVideo;
