import { Button } from "@/components/ui/button";
import { useRef } from "react";
import { fetchFile } from "@ffmpeg/ffmpeg";

const FileInput = ({ onChange, disabled }) => {
  const inputRef = useRef(null);

  return (
    <div>
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        variant="secondary"
        className="w-full"
      >
        Choose video
      </Button>
      <input
        type="file"
        ref={inputRef}
        onChange={onChange}
        accept="video/*"
        disabled={disabled}
        className="hidden"
      />
    </div>
  );
};

export default function MediaList({
  mediaList,
  onMediaDragStart,
  ffmpegLoading,
  ffmpegLoaded,
  setLoading,
  setMediaList,
  ffmpeg,
}) {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleVideoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (ffmpegLoading || !ffmpegLoaded) {
      alert("Please wait for video processing to initialize...");
      return;
    }

    try {
      setLoading(true);
      const url = URL.createObjectURL(file);
      console.log("file type: ", file.type);
      const newMedia = {
        id: Date.now(),
        file,
        url,
        name: file.name,
        duration: 0,
        thumbnails: [],
        loading: true,
      };

      const formData = new FormData();
      formData.append("video", file);
      // Get video duration
      const video = document.createElement("video");
      video.src = url;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          newMedia.duration = video.duration;
          formData.append("duration", video.duration.toString());
          resolve();
        };
        video.onerror = reject;
      });

      setMediaList((prev) => [...prev, newMedia]);

      const response = await fetch("http://localhost:5050/api/preprocess", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      console.log('Preprocessed data:', data);

      // Generate thumbnails
      const thumbnails = await generateThumbnails(file, newMedia.duration);

      // Update media with thumbnails
      setMediaList((prev) =>
        prev.map((m) => (m.id === newMedia.id ? { ...m, thumbnails, loading: false } : m))
      );
    } catch (error) {
      console.error("Error uploading video:", error);
      alert("Failed to upload video. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const generateThumbnails = async (file, duration) => {
    if (!ffmpegLoaded) {
      console.error("FFmpeg not loaded");
      return [];
    }

    setLoading(true);
    const thumbnails = [];

    try {
      // Write the input file
      ffmpeg.FS("writeFile", "input.mp4", await fetchFile(file));

      const interval = Math.max(1, Math.floor(duration / 10)); // Generate 10 thumbnails
      const totalThumbnails = Math.min(10, Math.floor(duration));

      for (let i = 0; i < totalThumbnails; i++) {
        const time = i * interval;
        const outputName = `thumb_${i}.jpg`;

        // Generate thumbnail
        await ffmpeg.run(
          "-ss",
          time.toString(),
          "-i",
          "input.mp4",
          "-vf",
          "scale=160:-1",
          "-vframes",
          "1",
          outputName
        );

        // Read and create thumbnail URL
        const data = ffmpeg.FS("readFile", outputName);
        const thumbnail = URL.createObjectURL(
          new Blob([data.buffer], { type: "image/jpeg" })
        );
        thumbnails.push({ time, url: thumbnail });

        // Clean up the thumbnail file
        ffmpeg.FS("unlink", outputName);
      }

      // Clean up input file
      ffmpeg.FS("unlink", "input.mp4");

      return thumbnails;
    } catch (error) {
      console.error("Error generating thumbnails:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-[500px] shrink-0 bg-[#161B22] p-4 overflow-y-auto border-r border-[#30363D]">
      <h2 className="text-sm font-semibold mb-4 text-[#c9d1d9]">Media</h2>
      <div className="mb-6">
        <FileInput onChange={handleVideoUpload} disabled={ffmpegLoading} />
      </div>
      <div className="space-y-2">
        {mediaList.map((media) => (
          <div
            key={media.id}
            draggable
            onDragStart={() => onMediaDragStart(media)}
            className="flex gap-3 p-2 rounded-md cursor-move bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] group"
          >
            {/* Thumbnail */}
            <div className="w-32 h-20 bg-black rounded overflow-hidden flex-shrink-0">
              {media.loading ? (
                <div className="flex items-center justify-center w-full h-full">
                  <span className="text-white">Loading...</span> {/* Display loading text */}
                </div>
              ) : (
                media.thumbnails[0] && (
                  <img
                    src={media.thumbnails[0].url}
                    alt=""
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                )
              )}
            </div>

            {/* Metadata */}
            <div className="flex flex-col justify-between flex-1 min-w-0">
              <div>
                <div className="font-medium text-sm truncate text-[#c9d1d9]">
                  {media.name}
                </div>
                <div className="text-xs text-[#8b949e] mt-1">
                  {Math.round(media.duration)} seconds •{" "}
                  {formatFileSize(media.size)}
                </div>
              </div>

              {/* Thumbnails preview */}
              <div className="flex gap-0.5 mt-2 h-6 overflow-hidden">
                {media.loading ? null : media.thumbnails.slice(0, 6).map((thumb, i) => (
                  <img
                    key={i}
                    src={thumb.url}
                    alt=""
                    className="h-full w-auto object-cover rounded-sm"
                    draggable={false}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
