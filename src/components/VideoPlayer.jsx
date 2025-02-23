import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Inter, JetBrains_Mono } from "next/font/google";
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';


const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"] });

const ffmpeg = createFFmpeg({
    corePath: "https://unpkg.com/@ffmpeg/core@0.8.5/dist/ffmpeg-core.js",
});

export default function VideoPlayer({
  videoRef,
  currentClip,
  isPlaying,
  setIsPlaying,
  currentTime,
  projectDuration,
  updateVideoPlayback,
  setCurrentTime,
  selectedClipInfo,
  loading,
  timelineTracks,
  setTimelineTracks,
  setSelectedClipInfo,
  cutClip,
  ffmpegLoaded,
  setLoading,
  mediaList,
  ffmpeg,
  fetchFile
}) {
    const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds
      .toString()
      .padStart(2, "0")}`;
  };
  const handleDownload = async () => {
    if (!ffmpegLoaded) {
      alert("Please wait for video processing to initialize...");
      return;
    }

    try {
      setLoading(true);

      // Create a list of segments (clips and gaps)
      const segments = [];
      let currentTime = 0;

      // Sort all clips by start time
      const allClips = timelineTracks.flat().sort((a, b) => a.start - b.start);

      for (let i = 0; i < allClips.length; i++) {
        const clip = allClips[i];

        // If there's a gap before this clip, add a black video segment
        if (clip.start > currentTime) {
          const gapDuration = clip.start - currentTime;
          segments.push({
            type: "gap",
            duration: gapDuration,
          });
        }

        // Add the actual clip
        segments.push({
          type: "clip",
          clip,
          media: mediaList.find((m) => m.id === clip.mediaId),
        });

        currentTime = clip.start + clip.duration;
      }

      // If there's remaining time after the last clip, add a final black segment
      if (currentTime < projectDuration) {
        segments.push({
          type: "gap",
          duration: projectDuration - currentTime,
        });
      }

      // Create a file list for concatenation
      let fileList = "";
      let inputCount = 0;

      // Process each segment
      for (const segment of segments) {
        if (segment.type === "gap") {
          // Generate black video
          await ffmpeg.run(
            "-f",
            "lavfi",
            "-i",
            `color=c=black:s=1920x1080:r=30`,
            "-t",
            segment.duration.toString(),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            `gap_${inputCount}.mp4`
          );
          fileList += `file gap_${inputCount}.mp4\n`;
        } else {
          // Process actual video clip
          const { clip, media } = segment;
          await ffmpeg.FS(
            "writeFile",
            `input_${inputCount}.mp4`,
            await fetchFile(media.file)
          );

          // Cut and copy the clip portion
          await ffmpeg.run(
            "-ss",
            clip.offset.toString(),
            "-t",
            clip.duration.toString(),
            "-i",
            `input_${inputCount}.mp4`,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            `clip_${inputCount}.mp4`
          );

          fileList += `file clip_${inputCount}.mp4\n`;
          await ffmpeg.FS("unlink", `input_${inputCount}.mp4`);
        }
        inputCount++;
      }

      // Write the file list
      ffmpeg.FS("writeFile", "filelist.txt", fileList);

      // Concatenate using the concat demuxer
      await ffmpeg.run(
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "filelist.txt",
        "-c",
        "copy",
        "output.mp4"
      );

      // Read the output file
      const data = ffmpeg.FS("readFile", "output.mp4");

      // Clean up temporary files
      for (let i = 0; i < inputCount; i++) {
        try {
          ffmpeg.FS("unlink", `gap_${i}.mp4`);
        } catch (e) {}
        try {
          ffmpeg.FS("unlink", `clip_${i}.mp4`);
        } catch (e) {}
      }
      ffmpeg.FS("unlink", "filelist.txt");
      ffmpeg.FS("unlink", "output.mp4");

      // Create and trigger download
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edited_video.mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error during video export:", error);
      alert("Failed to export video. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const handleCutClip = () => {
    if (!selectedClipInfo) return;
    console.log('handlecutclip')
    const { clip } = selectedClipInfo; // No need for trackIndex since there's only one track
    console.log(clip)
        // Only cut if the point is within the clip
    // if (currentTime <= clip.start || currentTime >= clip.start + clip.duration)
    //     return;

    const cutPoint = currentTime - clip.start;


    console.log(clip)
    // Call the cutClip function to get the new clips
    cutClip(clip.clip_id, cutPoint);
    setSelectedClipInfo(null); // Clear the selected clip info
  };

  // Add the delete handler function
  const handleDeleteClip = () => {
    if (!selectedClipInfo) return;

    const { clip } = selectedClipInfo;

    deleteClip(clip.clip_id)

    setSelectedClipInfo(null); // Clear the selected clip info
  };

  const deleteClip = (clip_id) => {
    setTimelineTracks((prev) =>
      [prev[0].filter((c) => c.clip_id !== clip_id)]
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0D1117]">
      {/* Video container */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        <div className="relative w-full max-w-xl aspect-video bg-[#161B22] rounded-md overflow-hidden border border-[#30363D]">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain"
            onEnded={() => {
              videoRef.current?.pause();
            }}
          />
          {!currentClip && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              No video at current position
            </div>
          )}
        </div>
      </div>

      {/* Timeline controls */}
      <div className="shrink-0 px-4 pb-4 flex items-center gap-4">
        <Button
          onClick={() => {
            const newIsPlaying = !isPlaying;
            setIsPlaying(newIsPlaying);

            if (videoRef.current) {
              if (newIsPlaying) {
                updateVideoPlayback(currentTime);
              } else {
                videoRef.current.pause();
              }
            }
          }}
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>

        {/* Cut button */}
        <Button
          onClick={handleCutClip}
          disabled={!selectedClipInfo}
          variant="secondary"
        >
          Cut
        </Button>

        {/* Delete button */}
        <Button
          onClick={handleDeleteClip}
          disabled={!selectedClipInfo}
          variant="destructive"
        >
          Delete
        </Button>

        {/* Download button */}
        <Button
          onClick={handleDownload}
          disabled={loading || timelineTracks.flat().length === 0}
          variant="secondary"
          className="ml-auto"
        >
          {loading ? "Exporting..." : "Download"}
        </Button>

        <div className="flex-1 h-2 bg-[#21262D] rounded-full relative cursor-pointer">
          <div
            className="absolute h-full bg-[#58a6ff] rounded-full"
            style={{ width: `${(currentTime / projectDuration) * 100}%` }}
          />
        </div>
        <span className={`text-sm ${jetbrainsMono.className}`}>
          {formatTime(currentTime)} / {formatTime(projectDuration)}
        </span>
      </div>
    </div>
  );
}
