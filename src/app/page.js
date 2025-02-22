'use client';
import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import Image from "next/image";

export default function Home() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [trimmedVideoUrl, setTrimmedVideoUrl] = useState(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ffmpeg, setFFmpeg] = useState(null);
  const videoRef = useRef(null);
  const trimmedVideoRef = useRef(null);

  // Load FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      const ffmpegInstance = new FFmpeg();
      try {
        // Load ffmpeg.wasm-core script
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd'
        await ffmpegInstance.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFFmpeg(ffmpegInstance);
        console.log('FFmpeg is ready!');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
      }
    };
    loadFFmpeg();
  }, []);

  const handleVideoUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setTrimmedVideoUrl(null); // Reset trimmed video when new video is uploaded
      setStartTime(0);
      setEndTime(0);
      setCurrentTime(0);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setEndTime(videoRef.current.duration);
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleTimelineClick = (e) => {
    const timeline = e.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = percent * duration;
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleTrimVideo = async () => {
    if (!videoFile || startTime === null || endTime === null || !ffmpeg) return;
    
    try {
      setLoading(true);
      
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-ss', startTime.toString(),
        '-to', endTime.toString(),
        '-c', 'copy',
        'output.mp4'
      ]);
      
      const data = await ffmpeg.readFile('output.mp4');
      
      // Create URL for trimmed video preview
      const outputUrl = URL.createObjectURL(
        new Blob([data.buffer], { type: 'video/mp4' })
      );
      
      setTrimmedVideoUrl(outputUrl);
      
      // Cleanup FFmpeg files
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');
      
    } catch (error) {
      console.error('Error trimming video:', error);
      alert('Failed to trim video. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <ol className="list-inside list-decimal text-sm text-center sm:text-left font-[family-name:var(--font-geist-mono)]">
          <li className="mb-2">
            Get started by editing{" "}
            <code className="bg-black/[.05] dark:bg-white/[.06] px-1 py-0.5 rounded font-semibold">
              src/app/page.js
            </code>
            .
          </li>
          <li>Save and see your changes instantly.</li>
        </ol>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
            Deploy now
          </a>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:min-w-44"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read our docs
          </a>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold mb-6">Video Trimmer</h1>
          
          <div>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-violet-50 file:text-violet-700
                hover:file:bg-violet-100"
            />
          </div>

          {videoUrl && (
            <div className="space-y-4 bg-white p-6 rounded-lg shadow-sm">
              <h2 className="font-semibold">Original Video</h2>
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full rounded-lg"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
              />
              
              {/* Timeline */}
              <div className="space-y-2">
                <div
                  className="h-8 bg-gray-200 rounded-lg relative cursor-pointer"
                  onClick={handleTimelineClick}
                >
                  {/* Progress bar */}
                  <div
                    className="absolute h-full bg-violet-200 rounded-lg"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                  {/* Trim start marker */}
                  <div
                    className="absolute h-full w-2 bg-green-500 cursor-ew-resize"
                    style={{ left: `${(startTime / duration) * 100}%` }}
                    onDrag={(e) => {
                      const percent = e.clientX / e.currentTarget.parentElement.offsetWidth;
                      setStartTime(percent * duration);
                    }}
                  />
                  {/* Trim end marker */}
                  <div
                    className="absolute h-full w-2 bg-red-500 cursor-ew-resize"
                    style={{ left: `${(endTime / duration) * 100}%` }}
                    onDrag={(e) => {
                      const percent = e.clientX / e.currentTarget.parentElement.offsetWidth;
                      setEndTime(percent * duration);
                    }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Current: {formatTime(currentTime)}</span>
                  <span>Duration: {formatTime(duration)}</span>
                </div>
              </div>

              {/* Trim controls */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Time</label>
                  <input
                    type="number"
                    value={startTime}
                    onChange={(e) => setStartTime(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                    min="0"
                    max={duration}
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Time</label>
                  <input
                    type="number"
                    value={endTime}
                    onChange={(e) => setEndTime(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                    min="0"
                    max={duration}
                    step="0.1"
                  />
                </div>
              </div>
              
              <button
                onClick={handleTrimVideo}
                disabled={!videoFile || loading || !ffmpeg}
                className="w-full bg-violet-600 text-white py-2 px-4 rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Trim Video'}
              </button>
            </div>
          )}

          {/* Trimmed video preview */}
          {trimmedVideoUrl && (
            <div className="space-y-4 bg-white p-6 rounded-lg shadow-sm">
              <h2 className="font-semibold">Trimmed Video Preview</h2>
              <video
                ref={trimmedVideoRef}
                src={trimmedVideoUrl}
                controls
                className="w-full rounded-lg"
              />
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = trimmedVideoUrl;
                  link.download = 'trimmed-video.mp4';
                  link.click();
                }}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"
              >
                Download Trimmed Video
              </button>
            </div>
          )}
        </div>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/file.svg"
            alt="File icon"
            width={16}
            height={16}
          />
          Learn
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/window.svg"
            alt="Window icon"
            width={16}
            height={16}
          />
          Examples
        </a>
        <a
          className="flex items-center gap-2 hover:underline hover:underline-offset-4"
          href="https://nextjs.org?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            aria-hidden
            src="/globe.svg"
            alt="Globe icon"
            width={16}
            height={16}
          />
          Go to nextjs.org →
        </a>
      </footer>
    </div>
  );
}
