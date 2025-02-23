import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

// Create FFmpeg instance
const ffmpeg = createFFmpeg({
    log: true,
    corePath: "https://unpkg.com/@ffmpeg/core@0.8.5/dist/ffmpeg-core.js",
});

// Load FFmpeg
const loadFFmpeg = async () => {
    if (!ffmpeg.isLoaded()) {
        try {
            await ffmpeg.load();
            console.log('FFmpeg is ready!');
        } catch (error) {
            console.error('Failed to load FFmpeg:', error);
            throw error;
        }
    }
    return ffmpeg;
};

const writeInputFile = async (input) => {
const writeInputFile = async (input) => {
    try {
        const data = await fetchFile(input);
        if (data.length > MAX_FILE_SIZE) {
            throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        const data = await fetchFile(input);
        if (data.length > MAX_FILE_SIZE) {
            throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        }
        ffmpeg.FS('writeFile', 'input.mp4', data);
        console.log('File written successfully');
        ffmpeg.FS('writeFile', 'input.mp4', data);
        console.log('File written successfully');
    } catch (error) {
        console.error('Error writing input file:', error);
        throw error;
    }
};
const getOutputFile = async (ffmpeg, outputFileName) => {
    try {
        // List files in FS to debug
        const files = ffmpeg.FS('readdir', '/');
        console.log('Files in FFmpeg filesystem:', files);

        // Check if output file exists
        if (!files.includes(outputFileName)) {
            throw new Error(`Output file ${outputFileName} not found`);
        }

        const data = ffmpeg.FS('readFile', outputFileName);
        return data;
    } catch (error) {
        console.error('Error in getOutputFile:', error);
        throw new Error(`Error getting output file: ${error.message}`);
    }
};

const processVideo = async (input, ffmpegCommands, outputFileName) => {
    try {
        await loadFFmpeg();
        await writeInputFile(input);

        console.log('Running FFmpeg command:', ...ffmpegCommands);
        await ffmpeg.run(...ffmpegCommands);
        // List files in FS to debug
        const filesAfterProcessing = ffmpeg.FS('readdir', '/');
        console.log('Files in FFmpeg filesystem after processing:', filesAfterProcessing);

        const outputFile = await getOutputFile(ffmpeg, outputFileName);

        try {
            ffmpeg.FS('unlink', 'input.mp4');
            ffmpeg.FS('unlink', outputFileName);
        } catch (e) {
            console.log('Cleanup error:', e);
        }
        
        return outputFile;
    } catch (error) {
        console.error('Error processing video:', error);
        throw error;
    }
};

export const adjustBrightness = async (input, brightness, setMediaList) => {
    // Convert brightness to decimal if it's a whole number
    brightness = brightness > 1 ? brightness / 100 : brightness;
    console.log('Adjusting brightness:', brightness);
    try {
        const outputFileName = 'output.mp4';
        const data = await processVideo(input, [
            '-i', 'input.mp4',
            '-vf', `eq=brightness=${brightness}`,
            '-c:v', 'libx264',
            outputFileName
        ], outputFileName);

        // Create a blob from the Uint8Array data
        const outputBlob = new Blob([data.buffer], { type: 'video/mp4' });
        const outputFile = new File([outputBlob], 'brightness_adjusted.mp4', { type: 'video/mp4' });
        const outputUrl = URL.createObjectURL(outputBlob);

        // Create video element to get duration
        const video = document.createElement('video');
        video.src = outputUrl;
        
        // Wait for metadata to load to get duration
        await new Promise((resolve) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => resolve();
        });

        // Create new media entry
        const newMedia = {
            id: `media-${Date.now()}`,
            file: outputFile,
            url: outputUrl,
            name: `Brightness Adjusted (${brightness})`,
            duration: video.duration,
            thumbnails: [], // Thumbnails will be generated by MediaList component
            loading: false,
            type: 'video/mp4'
        };

        // Add to media list
        setMediaList(prev => [...prev, newMedia]);
        
        return newMedia.id;
    } catch (error) {
        console.error('Error adjusting brightness:', error);
        throw error;
    }
};

export const changeAspectRatio = async (input, width, height) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', `scale=${width}:${height},setsar=1:1`,
        '-c:a', 'copy',
        'output.mp4'
    ]);
};

export const applyColorGrading = async (input, contrast, gamma, saturation) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', `eq=contrast=${contrast}:gamma=${gamma}:saturation=${saturation}`,
        '-c:v', 'libx264',
        'output.mp4'
    ]);
};

export const adjustSaturation = async (input, saturation) => {
    return applyColorGrading(input, 1.0, 1.0, saturation);
};

export const addBlurEffect = async (input, blurStrength) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', `gblur=sigma=${blurStrength}`,
        '-c:v', 'libx264',
        'output.mp4'
    ]);
};

export const convertToGrayscale = async (input) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', 'hue=s=0',
        '-c:v', 'libx264',
        'output.mp4'
    ]);
};

// Example usage with error handling
export const runExamples = async () => {
    try {
        const videoPath = './test_video.mp4';
        // console.log('\nApplying color grading...');
        // const colorGradedUrl = await applyColorGrading(videoPath, null, null, 1.2, 1.0, 1.5);
        // console.log('Color graded video URL:', colorGradedUrl);

        // console.log('Processing grayscale effect...');
        // const grayscaleUrl = await convertToGrayscale(videoPath);
        // console.log('Grayscale video URL:', grayscaleUrl);

        // console.log('\nProcessing brightness adjustment...');
        // const brightnessUrl = await adjustBrightness(videoPath, null, null, 0.5); // 0.5 makes it brighter
        // console.log('Brightness adjusted video URL:', brightnessUrl);

        // console.log('\nProcessing blur effect...');
        // const blurUrl = await addBlurEffect(videoPath, null, null, 3.0); // 3.0 is blur strength
        // console.log('Blurred video URL:', blurUrl);

        // console.log('\nTesting different saturation levels...');
        // const lowSatUrl = await adjustSaturation(videoPath, null, null, 0.5); // Reduced saturation
        // console.log('Low saturation URL:', lowSatUrl);

        // const highSatUrl = await adjustSaturation(videoPath, null, null, 3.0); // High saturation
        // console.log('High saturation URL:', highSatUrl);
    } catch (error) {
        console.error('Error running examples:', error);
    }
};