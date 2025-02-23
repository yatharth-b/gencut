"use client";
import { useState, useRef, useEffect } from "react";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import Image from "next/image";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Button } from "@/components/ui/button";
import MediaList from "@/components/MediaList";
import VideoPlayer from "@/components/VideoPlayer";
import { addBlurEffect, adjustBrightness, adjustSaturation, applyColorGrading, convertToGrayscale, trimVideo } from "./utils";

const inter = Inter({ subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"] });

// Create FFmpeg instance outside the component
const ffmpeg = createFFmpeg({
  log: true,
  corePath: "https://unpkg.com/@ffmpeg/core@0.8.5/dist/ffmpeg-core.js",
});

export default function Home() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [mediaList, setMediaList] = useState([]); // List of all uploaded videos
  const [selectedMedia, setSelectedMedia] = useState(null); // Currently selected video
  const [currentTime, setCurrentTime] = useState(0);
  const [projectDuration, setProjectDuration] = useState(300); // 5 minutes default
  const [loading, setLoading] = useState(false);

  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFFmpegLoading] = useState(true);
  const [timelineTracks, setTimelineTracks] = useState([[]]); // Single track as a state
  const [draggingMedia, setDraggingMedia] = useState(null);
  const [draggingClip, setDraggingClip] = useState(null);
  const [thumbnails, setThumbnails] = useState([]); // Store video thumbnails
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const [currentClip, setCurrentClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [dragStartX, setDragStartX] = useState(null);
  const [selectedClipInfo, setSelectedClipInfo] = useState(null); // { clip }
  const [startCursor, setStartCursor] = useState(0);
  const [endCursor, setEndCursor] = useState(5); // Default to 5 seconds
  const [isDraggingStartCursor, setIsDraggingStartCursor] = useState(false);
  const [isDraggingEndCursor, setIsDraggingEndCursor] = useState(false);
  const [clipsInRange, setClipsInRange] = useState([]);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! I can help you analyze and edit your video. Select a portion of the timeline and ask me questions about it.",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatContainerRef = useRef(null);

  // Load FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        setFFmpegLoading(true);
        await ffmpeg.load();
        setFfmpegLoaded(true);
        console.log("FFmpeg is ready!");
      } catch (error) {
        console.error("Failed to load FFmpeg:", error);
        alert(
          "Failed to load video processing capabilities. Please refresh the page."
        );
      } finally {
        setFFmpegLoading(false);
      }
    };
    loadFFmpeg();
  }, []);

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds
      .toString()
      .padStart(2, "0")}`;
  };

  const handleTimelineDrop = (e) => {
    if (draggingMedia) {
      // Calculate drop position
      const timelineRect = timelineRef.current.getBoundingClientRect();
      const dropPosition =
        ((e.clientX - timelineRect.left) / timelineRect.width) * projectDuration;

      // Get media and create new clip
      const media = mediaList.find((m) => m.id === draggingMedia.id);
      const newClip = {
        id: Date.now().toString(),
        mediaId: draggingMedia.id,
        start: dropPosition,
        duration: draggingMedia.duration,
        offset: 0,
        imageDescriptions: media.imageDescriptions,
        imageAttributes: media.imageAttributes,
        transcription: media.transcription,
      };

      // Add the new clip to the single track
      setTimelineTracks((prev) => [
        [...prev[0], newClip].sort((a, b) => a.start - b.start),
      ]);
    } else if (draggingClip) {
      // Move existing clip
      const { clip } = draggingClip;
      const timelineRect = timelineRef.current.getBoundingClientRect();
      const dropPosition =
        ((e.clientX - timelineRect.left) / timelineRect.width) *
        projectDuration;
      const newStart = Math.max(0, dropPosition);

      setTimelineTracks((prev) => {
        const updatedTrack = prev[0].map((c) =>
          c.id === clip.id ? { ...clip, start: newStart } : c
        );
        return [updatedTrack.sort((a, b) => a.start - b.start)];
      });
    }

    setDraggingMedia(null);
    setDraggingClip(null);
  };

  const handleDeleteClip = () => {
    if (!selectedClipInfo) return;

    const { clip } = selectedClipInfo;

    setTimelineTracks((prev) => [
      prev[0].filter((c) => c.id !== clip.id), // Filter out the deleted clip
    ]);

    setSelectedClipInfo(null); // Clear the selected clip info
  };

  const deleteClip = (clip_id) => {
    setTimelineTracks((prev) =>
      [prev[0].filter((c) => c.id !== clip_id)]
    );
  }

  const handleMediaDragStart = (media) => {
    setDraggingMedia(media);
  };

  const handleClipDragStart = (e, trackIndex, clipIndex) => {
    e.preventDefault(); // Prevent default drag image
    const clip = timelineTracks[trackIndex][clipIndex];
    setDraggingClip({ clip, trackIndex, clipIndex });
  };

  const handleClipMouseDown = (e, trackIndex, clipIndex) => {
    e.preventDefault();
    const clip = timelineTracks[trackIndex][clipIndex];
    const rect = timelineRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;

    setDragStartX(startX);
    setDraggingClip({
      clip,
      trackIndex,
      clipIndex,
      initialStart: clip.start,
    });

    // Add window-level event listeners
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e) => {
    if (!draggingClip || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const deltaX = currentX - dragStartX;
    const timeDelta = (deltaX / rect.width) * projectDuration;
    const newStart = Math.max(
      0,
      Math.min(
        projectDuration - draggingClip.clip.duration,
        draggingClip.initialStart + timeDelta
      )
    );

    // Update the timelineTracks state directly
    setTimelineTracks((prev) => {
      const updatedTrack = prev[0].map((clip) =>
        clip.id === draggingClip.clip.id ? { ...clip, start: newStart } : clip
      );
      return [updatedTrack];
    });
  };

  const handleMouseUp = () => {
    if (draggingClip) {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setDraggingClip(null);
      setDragStartX(null);
    }
  };

  const findClipAtTime = (time) => {
    for (const track of timelineTracks) {
      const clip = track.find(
        (c) => time >= c.start && time <= c.start + c.duration
      );
      if (clip) return clip;
    }
    return null;
  };

  const updateVideoPlayback = (time) => {
    const clip = findClipAtTime(time);
    setCurrentClip(clip);

    if (videoRef.current) {
      if (clip) {
        const media = mediaList.find((m) => m.id === clip.mediaId);
        if (media) {
          if (!videoRef.current.src.includes(media.url)) {
            videoRef.current.src = media.url;
            videoRef.current.load(); // Ensure video is properly loaded
          }
          const clipTime = time - clip.start + clip.offset;
          if (Math.abs(videoRef.current.currentTime - clipTime) > 0.1) {
            videoRef.current.currentTime = clipTime;
          }
          if (isPlaying && videoRef.current.paused) {
            videoRef.current.play().catch(console.error);
          }
        }
      } else {
        if (!videoRef.current.paused) {
          videoRef.current.pause();
        }
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
    }
  };

  const handleTimelineClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = Math.max(
      0,
      Math.min(projectDuration, percent * projectDuration)
    );

    setCurrentTime(newTime);
    updateVideoPlayback(newTime);
  };

  const handlePlayheadMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    setIsPlaying(false); // Pause while dragging
  };

  const handleTimelineMouseMove = (e) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = Math.max(
      0,
      Math.min(projectDuration, percent * projectDuration)
    );

    if (isDraggingStartCursor) {
      setStartCursor(Math.min(newTime, endCursor));
    } else if (isDraggingEndCursor) {
      setEndCursor(Math.max(newTime, startCursor));
    } else if (isDraggingPlayhead) {
      setCurrentTime(newTime);
      updateVideoPlayback(newTime);
    }
  };

  const handleTimelineMouseUp = () => {
    setIsDraggingPlayhead(false);
    setIsDraggingStartCursor(false);
    setIsDraggingEndCursor(false);
    setDraggingClip(null);
  };

  const createMediaCopy = async (originalMediaId) => {
    // Find the original media from mediaList
    const originalMedia = mediaList.find(m => m.id === originalMediaId);
    if (!originalMedia) {
        console.error("Original media not found");
        return null;
    }

    // Create a deep copy of the original media file and blob
    const originalBlob = originalMedia.file;
    const copiedBlob = new Blob([originalBlob], { type: originalBlob.type });
    const copiedFile = new File([copiedBlob], `${originalMedia.name}_copy.mp4`, { type: originalBlob.type });
    const copiedUrl = URL.createObjectURL(copiedBlob);

    // Create a deep copy of the media object
    const newMedia = {
        id: `media-${Date.now()}`,
        file: copiedFile,
        url: copiedUrl,
        name: `${originalMedia.name} for second half`,
        duration: originalMedia.duration,
        thumbnails: originalMedia.thumbnails.map(thumb => ({...thumb})), // Deep copy thumbnails
        loading: false,
        type: originalMedia.type,
        hidden: true
    };

    // Add new media to mediaList
    setMediaList(prev => [...prev, newMedia]);
    return newMedia.id;
  };

  const cutClip = async (clipId, cutPoint) => {
    console.log(timelineTracks)
    const clipToCut = timelineTracks[0].find(c => c.id === clipId);
    if (!clipToCut) {
      console.error("Clip not found with ID:", clipId);
      return;
    }

    // Calculate the first half
    const firstHalf = {
      id: Date.now().toString(),
      mediaId: clipToCut.mediaId,
      start: clipToCut.start,
      duration: cutPoint,
      offset: clipToCut.offset,
      imageDescriptions: clipToCut.imageDescriptions.slice(
        0,
        Math.ceil(cutPoint)
      ),
      imageAttributes: clipToCut.imageAttributes.slice(0, Math.ceil(cutPoint)),
      transcription: clipToCut.transcription.slice(0, Math.ceil(cutPoint)),
    };
    
    const secondHalf = {
      id: (Date.now() + 1).toString(),
      mediaId: clipToCut.mediaId,
      start: clipToCut.start + cutPoint,
      duration: clipToCut.duration - cutPoint,
      offset: clipToCut.offset + cutPoint,
      // Filter attributes for the second half
      imageDescriptions: clipToCut.imageDescriptions.slice(Math.ceil(cutPoint)),
      imageAttributes: clipToCut.imageAttributes.slice(Math.ceil(cutPoint)),
      transcription: clipToCut.transcription.slice(Math.ceil(cutPoint)),
    };

    // Create copy and update secondHalf
    const newMediaId = await createMediaCopy(clipToCut.mediaId);
    if (newMediaId) {
        secondHalf.mediaId = newMediaId;
    }



    // Update the single track directly
    setTimelineTracks((prev) => {
        const updatedTrack = prev[0].map((c) => {
            if (c.id === clipToCut.id) {
                // Replace the cut clip with the two new pieces
                return [firstHalf, secondHalf];
            }
            return [c];
        }).flat();

        return [updatedTrack]; // Return a new array with the updated track
    });
  };

  const moveClip = (clipId, newStart) => {
    console.log("Move clip", clipId, newStart);
    const clipToMove = timelineTracks[0].find(c => c.id === clipId);
    if (!clipToMove) {
        console.error("Clip not found with ID:", clipId);
        return;
    }

    const newClip = {
      id: clipToMove.id,
      mediaId: clipToMove.mediaId,
      start: newStart,
      duration: clipToMove.duration,
      offset: clipToMove.offset
    }

    console.log("moveClip", clipToMove, newStart);
    clipToMove.start = newStart;

    // Update the single track directly
    setTimelineTracks((prev) => {
      const updatedTrack = prev[0].map((c) => {
        if (c.id === clipToMove.id) {
          return newClip;
        }
        return c;
      });

      return [updatedTrack]; // Return a new array with the updated track
    });
  }

  const handleClipClick = (e, trackIndex, clipIndex, clip) => {
    e.stopPropagation(); // Prevent timeline click
    setSelectedClipInfo({ clip });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setIsChatLoading(true);

    let prevMessages = [...messages];
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
        let clipContexts = clipsInRange.map((clip) => JSON.stringify(clip));

        // Filter out card and function call messages before sending
        const messagesToSend = prevMessages.filter(msg => msg.role !== 'card');

        let response = await fetch("http://localhost:5050/api/chatv2", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages: [...messagesToSend, { role: 'user', content: userMessage }],
                clipContexts: clipContexts,
                type: "new_chat",
            }),
        });
      // Get clip contexts

      const parseModifyJson = (data) => {
        const functionArgs = JSON.parse(data.function_args);
        console.log(data.function_name);
        console.log(functionArgs);
        const selectedClip = timelineTracks[0].find(clip => clip.id === functionArgs.clipId);
        console.log(selectedClip)
        const videoUrl = mediaList.find(m => m.id === selectedClip?.mediaId)?.url;
        console.log(videoUrl)
        return {functionArgs, selectedClip, videoUrl};
      };

        let responseData = await response.json();
        let task_id = responseData.task_id;

        while (responseData.type == "function_call") {
            const functionArgs = JSON.parse(responseData.function_args);
            
            // Add function call message to chat history
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: `Executing function: ${responseData.function_name} with args: ${JSON.stringify(functionArgs)}`,
                },
                {
                  role: 'card',
                  function: `${responseData.function_name}`,
                  arguments: `${JSON.stringify(functionArgs)}`
              }
            ]);

            // Call the respective function based on the function name
            if (responseData.function_name === "cutClip") {
                cutClip(functionArgs.clipId, functionArgs.cutPoint);
            }

            if (responseData.function_name === "moveClip") {
                moveClip(functionArgs.clipId, functionArgs.start);
            }

            if (responseData.function_name === "deleteClip") {
                deleteClip(functionArgs.clipId);
            }

            if (responseData.function_name === "adjustBrightness") {
                const [functionArgs, selectedClip, videoUrl] = parseModifyJson(responseData);
                if (videoUrl) {
                const selectedMedia = mediaList.find(m => m.id === selectedClip?.mediaId);
                const newMediaId = await adjustBrightness(selectedMedia.file, functionArgs.brightness, setMediaList);
                // Update the clip to point to the new media
                setTimelineTracks(prev => prev.map(track => 
                    track.map(clip => 
                    clip.id === functionArgs.clipId 
                        ? {...clip, mediaId: newMediaId}
                        : clip
                    )
                ));
                }
            }

            if (responseData.function_name === "applyColorGrading") {
                const [functionArgs, selectedClip, videoUrl] = parseModifyJson(responseData);
                if (videoUrl) {
                const selectedMedia = mediaList.find(m => m.id === selectedClip?.mediaId);
                const newMediaId = await applyColorGrading(selectedMedia.file, functionArgs.contrast, functionArgs.gamma, functionArgs.saturation, setMediaList);
                // Update the clip to point to the new media
                setTimelineTracks(prev => prev.map(track => 
                    track.map(clip => 
                    clip.id === functionArgs.clipId 
                        ? {...clip, mediaId: newMediaId}
                        : clip
                    )
                ));
                }
            }

            if (responseData.function_name === "adjustSaturation") {
                const [functionArgs, selectedClip, videoUrl] = parseModifyJson(responseData);
                if (videoUrl) {
                const selectedMedia = mediaList.find(m => m.id === selectedClip?.mediaId);
                const newMediaId = await adjustSaturation(selectedMedia.file, functionArgs.saturation, setMediaList);
                // Update the clip to point to the new media
                setTimelineTracks(prev => prev.map(track => 
                    track.map(clip => 
                    clip.id === functionArgs.clipId 
                        ? {...clip, mediaId: newMediaId}
                        : clip
                    )
                ));
                }
            }

            if (responseData.function_name === "addBlurEffect") {
                const [functionArgs, selectedClip, videoUrl] = parseModifyJson(responseData);
                if (videoUrl) {
                const selectedMedia = mediaList.find(m => m.id === selectedClip?.mediaId);
                const newMediaId = await addBlurEffect(selectedMedia.file, functionArgs.blurStrength, setMediaList);
                // Update the clip to point to the new media
                setTimelineTracks(prev => prev.map(track => 
                    track.map(clip => 
                    clip.id === functionArgs.clipId 
                        ? {...clip, mediaId: newMediaId}
                        : clip
                    )
                ));
                }
            }

            if (responseData.function_name === "convertToGrayscale") {
                const [functionArgs, selectedClip, videoUrl] = parseModifyJson(responseData);
                if (videoUrl) {
                const selectedMedia = mediaList.find(m => m.id === selectedClip?.mediaId);
                console.log("selected media: ", selectedMedia);
                const newMediaId = await convertToGrayscale(selectedMedia.file, setMediaList);
                // Update the clip to point to the new media
                setTimelineTracks(prev => prev.map(track => 
                    track.map(clip => 
                    clip.id === functionArgs.clipId
                        ? {...clip, mediaId: newMediaId}
                        : clip
                    )
                ));
            }
        }

            if (responseData.function_name === "trim_video") {
                const selectedClip = timelineTracks[0].find(clip => clip.id === functionArgs.clipId);
                const selectedMedia = mediaList.find(m => m.id === selectedClip?.mediaId);
                if (!selectedMedia) {
                    console.error('Media not found for clip');
                    return;
                }
                const newMediaId = await trimVideo(selectedMedia.file, functionArgs.start_time, functionArgs.end_time, setMediaList);
                // Update the clip to point to the new media
                setTimelineTracks(prev => prev.map(track => 
                    track.map(clip => 
                        clip.id === functionArgs.clipId 
                            ? {...clip, mediaId: newMediaId}
                            : clip
                    )
                ));
            }

            clipContexts = clipsInRange.map((clip) => JSON.stringify(clip));

            response = await fetch("http://localhost:5050/api/chatv2", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: messagesToSend,
                    clipContexts: clipContexts,
                    type: "continue_task",
                    task_id: task_id,
                }),
            });

            responseData = await response.json();
        }

        if (responseData.type == 'message') {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: responseData.message,
                },
            ]);
        }

        setIsChatLoading(false);

    } catch (error) {
        console.error("Error sending message:", error);
        setMessages((prev) => [
            ...prev,
            {
                role: "assistant",
                content: "Sorry, I encountered an error processing your request.",
                type: "error",
            },
        ]);
    }
  };

  useEffect(() => {
    let lastTime = performance.now();
    let frameId;

    const animate = () => {
      if (isPlaying) {
        const currentTime = performance.now();
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        setCurrentTime((prevTime) => {
          const newTime = prevTime + deltaTime;
          if (newTime >= projectDuration) {
            setIsPlaying(false);
            return 0;
          }
          return newTime;
        });
      }
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, projectDuration]);

  useEffect(() => {
    updateVideoPlayback(currentTime);
  }, [currentTime]);

  useEffect(() => {
    if (isDraggingPlayhead) {
      const handleMouseUp = () => setIsDraggingPlayhead(false);
      window.addEventListener("mouseup", handleMouseUp);
      return () => window.removeEventListener("mouseup", handleMouseUp);
    }
  }, [isDraggingPlayhead]);

  useEffect(() => {
    const clips = timelineTracks[0]
      .filter((clip) => {
        // Check if clip overlaps with cursor range
        const clipEnd = clip.start + clip.duration;
        return clip.start <= endCursor && clipEnd >= startCursor;
      })
      .map((clip) => ({
        ...clip,
        mediaName:
          mediaList.find((m) => m.id === clip.mediaId)?.name || "Unknown",
      }));

    setClipsInRange(clips);
  }, [startCursor, endCursor, mediaList, timelineTracks]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleCursorMouseDown = (e, isCursorStart) => {
    e.stopPropagation();
    if (isCursorStart) {
      setIsDraggingStartCursor(true);
    } else {
      setIsDraggingEndCursor(true);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden bg-[#0D1117] text-[#c9d1d9] ${inter.className}`}
    >
      {/* Header */}
      <div className="shrink-0 bg-[#161B22] px-4 py-2 border-b border-[#30363D]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Duration (s):</label>
            <input
              type="number"
              value={projectDuration}
              onChange={(e) => setProjectDuration(Number(e.target.value))}
              className="bg-[#0D1117] text-[#c9d1d9] px-2 py-1 rounded border border-[#30363D] w-20 text-sm focus:border-[#58a6ff] focus:outline-none"
              min="1"
            />
          </div>
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex min-w-0">
        {/* Media list */}
        <div className="h-full overflow-y-auto overflow-x-hidden bg-[#161B22] border-r border-[#30363D]">
          <MediaList
            mediaList={mediaList}
            onMediaDragStart={handleMediaDragStart}
            ffmpegLoading={ffmpegLoading}
            ffmpegLoaded={ffmpegLoaded}
            setLoading={setLoading}
            setMediaList={setMediaList}
            ffmpeg={ffmpeg}
          />
        </div>

        {/* Preview and Chat area */}
        <div className="flex-1 flex min-w-0">
          {/* Video preview */}
          <VideoPlayer
            videoRef={videoRef}
            currentClip={currentClip}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            currentTime={currentTime}
            projectDuration={projectDuration}
            updateVideoPlayback={updateVideoPlayback}
            setCurrentTime={setCurrentTime}
            selectedClipInfo={selectedClipInfo}
            loading={loading}
            timelineTracks={timelineTracks}
            setTimelineTracks={setTimelineTracks}
            setSelectedClipInfo={setSelectedClipInfo}
            cutClip={cutClip}
            ffmpegLoaded={ffmpegLoaded}
            setLoading={setLoading}
            mediaList={mediaList}
            ffmpeg={ffmpeg}
            fetchFile={fetchFile}
          />

          {/* Chat panel */}
          <div className="w-[400px] shrink-0 bg-[#161B22] border-l border-[#30363D] flex flex-col h-full">
            {/* Header - fixed height */}
            <div className="p-4 border-b border-[#30363D] shrink-0">
              <h2 className="text-sm font-semibold text-[#c9d1d9]">Chat</h2>
            </div>

            {/* Selected clips section - fixed height */}
            <div className="p-4 border-b border-[#30363D] shrink-0">
              <h3 className="text-xs font-medium text-[#8b949e] uppercase tracking-wider mb-3">
                Selected Clips
              </h3>
              <div className="h-[120px] overflow-y-auto pr-2 space-y-2 [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-thumb]:bg-[#30363D] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                {clipsInRange.length === 0 ? (
                  <div className="text-sm text-[#8b949e]">
                    No clips selected
                  </div>
                ) : (
                  clipsInRange.map((clip, index) => (
                    <div
                      key={clip.id}
                      className="bg-[#21262D] rounded-md p-2 text-sm border border-[#30363D]"
                    >
                      <div className="font-medium text-[#c9d1d9]">
                        {clip.mediaName}
                      </div>
                      <div className="text-xs text-[#8b949e] mt-1">
                        {formatTime(clip.start)} -{" "}
                        {formatTime(clip.start + clip.duration)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat messages - with fixed height */}
            <div
              ref={chatContainerRef}
              className="h-[300px] overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar-thumb]:bg-[#30363D] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
            >
              {messages.map((message, index) => {
                if (message.role === "card") {
                  return (
                    <div key={index} className="bg-[#21262D] rounded-md p-2 text-sm border border-[#30363D]">
                      <div className="font-medium text-[#c9d1d9]">
                        {message.function}
                      </div>
                      <div className="text-xs text-[#8b949e] mt-1">
                        Arguments: {message.arguments}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={index}
                    className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`rounded-lg p-3 text-sm max-w-[80%] ${
                        message.role === "user"
                          ? "bg-[#238636] text-white"
                          : "bg-[#21262D] text-[#c9d1d9]"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                );
              })}
              {isChatLoading && (
                <div className="flex items-start">
                  <div className="bg-[#21262D] rounded-lg p-3 text-sm text-[#c9d1d9]">
                    Thinking...
                  </div>
                </div>
              )}
            </div>

            {/* Chat input - fixed height */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 border-t border-[#30363D] shrink-0"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-[#0D1117] text-[#c9d1d9] px-3 py-2 rounded-md border border-[#30363D] text-sm focus:outline-none focus:border-[#58a6ff]"
                />
                <Button type="submit" size="sm">
                  Send
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="h-64 shrink-0 bg-[#161B22] border-t border-[#30363D]">
        <div className="h-full flex flex-col p-4">
          {/* Timeline ruler */}
          <div
            className="h-6 shrink-0 bg-[#0D1117] mb-2 relative cursor-pointer select-none border-b border-[#30363D]"
            onClick={handleTimelineClick}
            onMouseMove={handleTimelineMouseMove}
            onMouseUp={handleTimelineMouseUp}
          >
            {/* Time markers */}
            {Array.from({ length: projectDuration + 1 }).map((_, i) => {
              const interval = projectDuration / 5; // Calculate the major interval
              const isMajorMarker = i % interval < 1; // Check if this is a major marker point

              return (
                <div
                  key={i}
                  className="absolute top-0 flex flex-col items-center"
                  style={{
                    left: `${(i / projectDuration) * 100}%`,
                    transform: "translateX(-50%)",
                    borderLeft: isMajorMarker ? "1px solid #333333" : "none",
                    height: isMajorMarker ? "100%" : "0%", // Only show major markers
                    display: isMajorMarker ? "flex" : "none", // Hide minor markers completely
                  }}
                >
                  {isMajorMarker && (
                    <div
                      className={`absolute top-2 text-[10px] text-[#8b949e] ${jetbrainsMono.className}`}
                    >
                      {formatTime(i)}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Start Cursor (Red) */}
            <div
              className="absolute top-0 bottom-0 z-10"
              style={{
                left: `${(startCursor / projectDuration) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className="absolute w-2.5 h-2.5 cursor-ew-resize"
                style={{ top: "-4px", left: "-3.5px" }}
                onMouseDown={(e) => handleCursorMouseDown(e, true)}
              >
                <div className="w-full h-full bg-red-500 transform rotate-45" />
              </div>
              <div className="absolute top-0 w-[1px] h-[calc(100vh-12rem)] bg-red-500 opacity-50" />
            </div>

            {/* End Cursor (Blue) */}
            <div
              className="absolute top-0 bottom-0 z-10"
              style={{
                left: `${(endCursor / projectDuration) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className="absolute w-2.5 h-2.5 cursor-ew-resize"
                style={{ top: "-4px", left: "-3.5px" }}
                onMouseDown={(e) => handleCursorMouseDown(e, false)}
              >
                <div className="w-full h-full bg-blue-500 transform rotate-45" />
              </div>
              <div className="absolute top-0 w-[1px] h-[calc(100vh-12rem)] bg-blue-500 opacity-50" />
            </div>

            {/* Playhead */}
            <div
              className={`absolute top-0 bottom-0 pointer-events-none z-10 ${
                isDraggingPlayhead ? "pointer-events-auto cursor-ew-resize" : ""
              }`}
              style={{
                left: `${(currentTime / projectDuration) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              {/* Diamond marker */}
              <div
                className="absolute w-2.5 h-2.5 cursor-ew-resize"
                style={{ top: "-4px", left: "-3.5px" }}
                onMouseDown={handlePlayheadMouseDown}
              >
                <div className="w-full h-full bg-white transform rotate-45" />
              </div>
              {/* Vertical line */}
              <div className="absolute top-0 w-[1px] h-[calc(100vh-12rem)] bg-white" />
            </div>
          </div>

          {/* Timeline tracks - scrollable */}
          <div
            ref={timelineRef}
            className="flex-1 flex flex-col gap-[1px] overflow-y-auto relative min-h-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleTimelineDrop}
          >
            <div
              key={0}
              className="h-20 bg-[#0D1117] relative border-b border-[#30363D] last:border-b-0"
            >
              {timelineTracks[0].map((clip, clipIndex) => {
                const media = mediaList.find((m) => m.id === clip.mediaId);
                return (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => handleClipMouseDown(e, 0, clipIndex)}
                    onClick={(e) => handleClipClick(e, 0, clipIndex, clip)}
                    className={`absolute top-0 h-full cursor-move overflow-hidden border transition-colors
                      ${
                        selectedClipInfo?.clip.id === clip.id
                          ? "bg-[#1f6feb] border-[#58a6ff]"
                          : "bg-[#21262D] border-[#30363D] hover:bg-[#30363D]"
                      }`}
                    style={{
                      left: `${(clip.start / projectDuration) * 100}%`,
                      width: `${(clip.duration / projectDuration) * 100}%`,
                    }}
                  >
                    <div className="flex h-full">
                      {media?.thumbnails.map((thumb, i) => (
                        <img
                          key={i}
                          src={thumb.url}
                          alt=""
                          className="h-full object-cover flex-shrink-0"
                          style={{
                            width: `${
                              (clip.duration /
                                media.thumbnails.length /
                                projectDuration) *
                              timelineRef.current?.clientWidth
                            }px`,
                          }}
                          draggable={false}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
