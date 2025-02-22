'use client';
import { useState, useRef, useEffect } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import Image from "next/image";
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Button } from "@/components/ui/button";
import MediaList from "@/components/MediaList";
import VideoPlayer from '@/components/VideoPlayer';

const inter = Inter({ subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'] });

// Create FFmpeg instance outside the component
const ffmpeg = createFFmpeg({ 
  log: true,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.8.5/dist/ffmpeg-core.js'
});

export default function Home() {
  const [mediaList, setMediaList] = useState([]); // List of all uploaded videos
  const [selectedMedia, setSelectedMedia] = useState(null); // Currently selected video
  const [currentTime, setCurrentTime] = useState(0);
  const [projectDuration, setProjectDuration] = useState(300); // 5 minutes default
  const [loading, setLoading] = useState(false);

  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFFmpegLoading] = useState(true);
  const [timelineTracks, setTimelineTracks] = useState([[]]);  // Array of tracks, each track is an array of clips
  const [draggingMedia, setDraggingMedia] = useState(null);
  const [draggingClip, setDraggingClip] = useState(null);
  const [thumbnails, setThumbnails] = useState([]); // Store video thumbnails
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const [currentClip, setCurrentClip] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [dragStartX, setDragStartX] = useState(null);
  const [selectedClipInfo, setSelectedClipInfo] = useState(null); // { trackIndex, clipIndex, clip }
  const [startCursor, setStartCursor] = useState(0);
  const [endCursor, setEndCursor] = useState(5); // Default to 5 seconds
  const [isDraggingStartCursor, setIsDraggingStartCursor] = useState(false);
  const [isDraggingEndCursor, setIsDraggingEndCursor] = useState(false);
  const [clipsInRange, setClipsInRange] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  // Add state for chat context
  const [chatContext, setChatContext] = useState({
    imageDescriptions: [],
    transcription: [],
    initialized: false
  });

  // Load FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        setFFmpegLoading(true);
        await ffmpeg.load();
        setFfmpegLoaded(true);
        console.log('FFmpeg is ready!');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        alert('Failed to load video processing capabilities. Please refresh the page.');
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
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

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
      initialStart: clip.start
    });

    // Add window-level event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e) => {
    if (!draggingClip || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const deltaX = currentX - dragStartX;
    const timeDelta = (deltaX / rect.width) * projectDuration;
    const newStart = Math.max(0, Math.min(
      projectDuration - draggingClip.clip.duration,
      draggingClip.initialStart + timeDelta
    ));

    setTimelineTracks(prev => prev.map((track, i) => {
      if (i === draggingClip.trackIndex) {
        return track.map(clip => 
          clip.id === draggingClip.clip.id 
            ? { ...clip, start: newStart }
            : clip
        );
      }
      return track;
    }));
  };

  const handleMouseUp = () => {
    if (draggingClip) {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setDraggingClip(null);
      setDragStartX(null);
    }
  };

  const handleTimelineDrop = (e) => {
    e.preventDefault();
    const timelineRect = timelineRef.current.getBoundingClientRect();
    const dropPosition = (e.clientX - timelineRect.left) / timelineRect.width * projectDuration;
    
    if (draggingMedia) {
      // Add new clip from media
      const newClip = {
        id: Date.now(),
        mediaId: draggingMedia.id,
        start: dropPosition,
        duration: draggingMedia.duration,
        offset: 0
      };
      
      // Find first track with space for the clip
      let targetTrackIndex = timelineTracks.findIndex(track => 
        !track.some(clip => 
          (newClip.start < clip.start + clip.duration) && 
          (newClip.start + newClip.duration > clip.start)
        )
      );
      
      if (targetTrackIndex === -1) {
        // Add new track if no space found
        setTimelineTracks(prev => [...prev, [newClip]]);
      } else {
        // Add to existing track
        setTimelineTracks(prev => prev.map((track, i) => 
          i === targetTrackIndex ? [...track, newClip].sort((a, b) => a.start - b.start) : track
        ));
      }
    } else if (draggingClip) {
      // Move existing clip
      const { clip, trackIndex: oldTrackIndex, clipIndex } = draggingClip;
      const newStart = Math.max(0, dropPosition);
      
      setTimelineTracks(prev => prev.map((track, i) => {
        if (i === oldTrackIndex) {
          return track.filter((_, index) => index !== clipIndex);
        }
        return track;
      }));
      
      const updatedClip = { ...clip, start: newStart };
      setTimelineTracks(prev => {
        const newTracks = [...prev];
        newTracks[oldTrackIndex] = [...newTracks[oldTrackIndex], updatedClip]
          .sort((a, b) => a.start - b.start);
        return newTracks;
      });
    }
    
    setDraggingMedia(null);
    setDraggingClip(null);
  };

  const findClipAtTime = (time) => {
    for (const track of timelineTracks) {
      const clip = track.find(c => 
        time >= c.start && time <= (c.start + c.duration)
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
        const media = mediaList.find(m => m.id === clip.mediaId);
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
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    }
  };

  const handleTimelineClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = Math.max(0, Math.min(projectDuration, percent * projectDuration));
    
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
    const newTime = Math.max(0, Math.min(projectDuration, percent * projectDuration));

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

  const handleClipClick = (e, trackIndex, clipIndex, clip) => {
    e.stopPropagation(); // Prevent timeline click
    setSelectedClipInfo({ trackIndex, clipIndex, clip });
  };

  // Modify handleVideoUpload to set chat context
  const handleVideoUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setTrimmedVideoUrl(null);
      setStartTime(0);
      setEndTime(0);
      setCurrentTime(0);
      
      try {
        setLoading(true);
        const formData = new FormData();
        formData.append('video', file);
        formData.append('duration', duration.toString());

        const response = await fetch('http://localhost:5050/api/preprocess', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        console.log('Preprocessed data:', data);

        // Set chat context
        setChatContext({
          imageDescriptions: data.image_description,
          transcription: data.transcription,
          initialized: true
        });

        // Add initial messages with video analysis
        setMessages([
          {
            role: 'assistant',
            content: "I've analyzed your video. Here's what I found:"
          },
          {
            role: 'assistant',
            content: `Video Analysis:\n${data.image_description.join('\n')}`
          },
          {
            role: 'assistant',
            content: `Transcription:\n${data.transcription.join(' ')}`
          }
        ]);

      } catch (error) {
        console.error('Error preprocessing video:', error);
        alert('Failed to process video. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  // Modify handleChatSubmit to include context
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');
    setIsChatLoading(true);

    try {
      const response = await fetch('http://localhost:5050/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          context: {
            imageDescriptions: chatContext.imageDescriptions,
            transcription: chatContext.transcription
          }
        }),
      });

      const data = await response.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.message 
      }]);

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error processing your request.' 
      }]);
    } finally {
      setIsChatLoading(false);
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

        setCurrentTime(prevTime => {
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
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDraggingPlayhead]);

  useEffect(() => {
    const clips = timelineTracks.flatMap((track, trackIndex) => 
      track
        .filter(clip => {
          // Check if clip overlaps with cursor range
          const clipEnd = clip.start + clip.duration;
          return (clip.start <= endCursor && clipEnd >= startCursor);
        })
        .map(clip => ({
          ...clip,
          mediaName: mediaList.find(m => m.id === clip.mediaId)?.name || 'Unknown'
        }))
    );
    
    setClipsInRange(clips);
  }, [startCursor, endCursor, timelineTracks, mediaList]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
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

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden bg-[#0D1117] text-[#c9d1d9] ${inter.className}`}>
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
        <MediaList 
          mediaList={mediaList}
          onMediaDragStart={handleMediaDragStart}
          ffmpegLoading={ffmpegLoading}
          ffmpegLoaded={ffmpegLoaded}
          setLoading={setLoading}
          setMediaList={setMediaList}
          ffmpeg={ffmpeg}
        />

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
          />

          {/* Chat panel */}
          <div className="w-[400px] shrink-0 bg-[#161B22] border-l border-[#30363D] flex flex-col">
            <div className="p-4 border-b border-[#30363D]">
              <h2 className="text-sm font-semibold text-[#c9d1d9]">Chat</h2>
            </div>
            
            {/* Selected clips section - fixed height */}
            <div className="p-4 border-b border-[#30363D]">
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
                        {formatTime(clip.start)} - {formatTime(clip.start + clip.duration)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(message => (
                <div key={message.id} className="flex flex-col">
                  <div className="bg-[#21262D] rounded-lg p-3 text-sm text-[#c9d1d9]">
                    {message.text}
                  </div>
                  <span className="text-xs text-[#8b949e] mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Chat input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-[#30363D]">
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
                    transform: 'translateX(-50%)',
                    borderLeft: isMajorMarker ? '1px solid #333333' : 'none',
                    height: isMajorMarker ? '100%' : '0%', // Only show major markers
                    display: isMajorMarker ? 'flex' : 'none' // Hide minor markers completely
                  }}
                >
                  {isMajorMarker && (
                    <div className={`absolute top-2 text-[10px] text-[#8b949e] ${jetbrainsMono.className}`}>
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
                transform: 'translateX(-50%)'
              }}
            >
              <div 
                className="absolute w-2.5 h-2.5 cursor-ew-resize"
                style={{ top: '-4px', left: '-3.5px' }}
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
                transform: 'translateX(-50%)'
              }}
            >
              <div 
                className="absolute w-2.5 h-2.5 cursor-ew-resize"
                style={{ top: '-4px', left: '-3.5px' }}
                onMouseDown={(e) => handleCursorMouseDown(e, false)}
              >
                <div className="w-full h-full bg-blue-500 transform rotate-45" />
              </div>
              <div className="absolute top-0 w-[1px] h-[calc(100vh-12rem)] bg-blue-500 opacity-50" />
            </div>

            {/* Playhead */}
            <div 
              className={`absolute top-0 bottom-0 pointer-events-none z-10 ${isDraggingPlayhead ? 'pointer-events-auto cursor-ew-resize' : ''}`}
              style={{ 
                left: `${(currentTime / projectDuration) * 100}%`,
                transform: 'translateX(-50%)'
              }}
            >
              {/* Diamond marker */}
              <div 
                className="absolute w-2.5 h-2.5 cursor-ew-resize"
                style={{ top: '-4px', left: '-3.5px' }}
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
            {timelineTracks.map((track, trackIndex) => (
              <div
                key={trackIndex}
                className="h-20 bg-[#0D1117] relative border-b border-[#30363D] last:border-b-0"
              >
                {track.map((clip, clipIndex) => {
                  const media = mediaList.find(m => m.id === clip.mediaId);
                  return (
                    <div
                      key={clip.id}
                      onMouseDown={(e) => handleClipMouseDown(e, trackIndex, clipIndex)}
                      onClick={(e) => handleClipClick(e, trackIndex, clipIndex, clip)}
                      className={`absolute top-0 h-full cursor-move overflow-hidden border transition-colors
                        ${selectedClipInfo?.clip.id === clip.id 
                          ? 'bg-[#1f6feb] border-[#58a6ff]' 
                          : 'bg-[#21262D] border-[#30363D] hover:bg-[#30363D]'}`}
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
                              width: `${(clip.duration / media.thumbnails.length / projectDuration) * timelineRef.current?.clientWidth}px`
                            }}
                            draggable={false}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
