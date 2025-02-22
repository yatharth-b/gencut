'use client';
import { useState, useRef, useEffect } from 'react';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import Image from "next/image";

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

  const generateThumbnails = async (file, duration) => {
    if (!ffmpegLoaded) {
      console.error('FFmpeg not loaded');
      return [];
    }
    
    setLoading(true);
    const thumbnails = [];
    
    try {
      // Write the input file
      ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

      const interval = Math.max(1, Math.floor(duration / 10)); // Generate 10 thumbnails
      const totalThumbnails = Math.min(10, Math.floor(duration));

      for (let i = 0; i < totalThumbnails; i++) {
        const time = i * interval;
        const outputName = `thumb_${i}.jpg`;

        // Generate thumbnail
        await ffmpeg.run(
          '-ss', time.toString(),
          '-i', 'input.mp4',
          '-vf', 'scale=160:-1',
          '-vframes', '1',
          outputName
        );

        // Read and create thumbnail URL
        const data = ffmpeg.FS('readFile', outputName);
        const thumbnail = URL.createObjectURL(
          new Blob([data.buffer], { type: 'image/jpeg' })
        );
        thumbnails.push({ time, url: thumbnail });

        // Clean up the thumbnail file
        ffmpeg.FS('unlink', outputName);
      }

      // Clean up input file
      ffmpeg.FS('unlink', 'input.mp4');

      return thumbnails;
    } catch (error) {
      console.error('Error generating thumbnails:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleVideoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (ffmpegLoading || !ffmpegLoaded) {
      alert('Please wait for video processing to initialize...');
      return;
    }

    try {
      setLoading(true);
      const url = URL.createObjectURL(file);
      const newMedia = {
        id: Date.now(),
        file,
        url,
        name: file.name,
        duration: 0,
        thumbnails: []
      };
      
      // Get video duration
      const video = document.createElement('video');
      video.src = url;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          newMedia.duration = video.duration;
          resolve();
        };
        video.onerror = reject;
      });

      // Add to media list first
      setMediaList(prev => [...prev, newMedia]);

      // Generate thumbnails
      const thumbnails = await generateThumbnails(file, newMedia.duration);
      
      // Update media with thumbnails
      setMediaList(prev => 
        prev.map(m => m.id === newMedia.id ? { ...m, thumbnails } : m)
      );

    } catch (error) {
      console.error('Error uploading video:', error);
      alert('Failed to upload video. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const handleMediaDragStart = (media) => {
    setDraggingMedia(media);
  };

  const handleClipDragStart = (trackIndex, clipIndex) => {
    const clip = timelineTracks[trackIndex][clipIndex];
    setDraggingClip({ clip, trackIndex, clipIndex });
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
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = percent * projectDuration;
    
    setCurrentTime(newTime);
    updateVideoPlayback(newTime);
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

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Project settings */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Project Duration (seconds)</label>
            <input
              type="number"
              value={projectDuration}
              onChange={(e) => setProjectDuration(Number(e.target.value))}
              className="bg-gray-700 text-white px-3 py-1 rounded"
              min="1"
            />
          </div>
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex min-h-0">
        {/* Media list */}
        <div className="w-64 bg-gray-800 p-4 overflow-y-auto border-r border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Media</h2>
          <input
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            disabled={ffmpegLoading}
            className={`mb-4 block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-violet-900 file:text-violet-100
              ${ffmpegLoading ? 'opacity-50 cursor-not-allowed' : 'hover:file:bg-violet-800'}`}
          />
          {ffmpegLoading && (
            <div className="text-sm text-gray-400 mb-4">
              Initializing video processing...
            </div>
          )}
          <div className="space-y-2">
            {mediaList.map(media => (
              <div
                key={media.id}
                draggable
                onDragStart={() => handleMediaDragStart(media)}
                className="p-2 rounded cursor-move bg-gray-700 hover:bg-gray-600"
              >
                <div className="font-medium truncate">{media.name}</div>
                <div className="text-xs text-gray-400">{formatTime(media.duration)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 p-4 flex flex-col bg-gray-950">
          {/* Video container with fixed aspect ratio */}
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-contain"
                onEnded={() => {
                  // Let the animation loop handle progression
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
          
          {/* Project timeline controls */}
          <div className="mt-4 flex items-center gap-4">
            <button
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
              className="px-4 py-2 bg-violet-600 rounded-lg hover:bg-violet-700"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <div className="flex-1 h-2 bg-gray-800 rounded-full relative cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                const newTime = percent * projectDuration;
                setCurrentTime(newTime);
                updateVideoPlayback(newTime);
              }}
            >
              <div
                className="absolute h-full bg-violet-600 rounded-full"
                style={{ width: `${(currentTime / projectDuration) * 100}%` }}
              />
            </div>
            <span className="text-sm">{formatTime(currentTime)} / {formatTime(projectDuration)}</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="h-64 bg-gray-800 border-t border-gray-700">
        <div className="h-full flex flex-col p-4">
          {/* Timeline ruler */}
          <div 
            className="h-6 bg-gray-900 mb-2 relative cursor-pointer"
            onClick={handleTimelineClick}
          >
            {Array.from({ length: Math.ceil(projectDuration / 60) }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-gray-700 text-xs text-gray-500"
                style={{ left: `${(i * 60 / projectDuration) * 100}%` }}
              >
                {i * 60}s
              </div>
            ))}
            
            {/* Add playhead */}
            <div 
              className="absolute top-0 h-full w-0.5 bg-red-500"
              style={{ 
                left: `${(currentTime / projectDuration) * 100}%`,
                transition: 'left 0.1s linear'
              }}
            />
          </div>

          {/* Timeline tracks */}
          <div
            ref={timelineRef}
            className="flex-1 flex flex-col gap-2 overflow-y-auto"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleTimelineDrop}
          >
            {timelineTracks.map((track, trackIndex) => (
              <div
                key={trackIndex}
                className="h-24 bg-gray-900 rounded relative"
              >
                {track.map((clip, clipIndex) => {
                  const media = mediaList.find(m => m.id === clip.mediaId);
                  return (
                    <div
                      key={clip.id}
                      draggable
                      onDragStart={() => handleClipDragStart(trackIndex, clipIndex)}
                      className="absolute top-0 h-full bg-violet-900 rounded cursor-move overflow-hidden"
                      style={{
                        left: `${(clip.start / projectDuration) * 100}%`,
                        width: `${(clip.duration / projectDuration) * 100}%`
                      }}
                    >
                      <div className="flex h-full">
                        {media?.thumbnails.map((thumb, i) => (
                          <img
                            key={i}
                            src={thumb.url}
                            alt=""
                            className="h-full w-16 object-cover flex-shrink-0"
                            style={{
                              width: `${(clip.duration / media.thumbnails.length / projectDuration) * timelineRef.current?.clientWidth}px`
                            }}
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
