import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

// Create FFmpeg instance
const ffmpeg = createFFmpeg({
    // log: true,
    corePath: "https://unpkg.com/@ffmpeg/core@0.8.5/dist/ffmpeg-core.js",
});

// Load FFmpeg
const loadFFmpeg = async () => {
    if (!ffmpeg.isLoaded()) {
        try {
            // Set up logger before loading
            // ffmpeg.setLogger(({ type, message }) => {
            //     console.log(`FFmpeg [${type}]: ${message}`);
            // });
            
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
    try {
        const data = await fetchFile(input);
        if (data.length > MAX_FILE_SIZE) {
            throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
        }
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
        // console.log('Files in FFmpeg filesystem after processing:', filesAfterProcessing);

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

const processVideoMediaList = async(input, effectName, ffmpegCommand, setMediaList) => {
    try {
        const outputFileName = 'output.mp4';
        const data = await processVideo(input, ffmpegCommand, outputFileName);
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
            name: effectName,
            duration: video.duration,
            thumbnails: [], // Thumbnails will be generated by MediaList component
            loading: false,
            type: 'video/mp4',
            hidden: true
        };

        // Add to media list
        setMediaList(prev => [...prev, newMedia]);
        
        return newMedia.id;
    } catch (error) {
        console.error('Error adjusting:', error);
        throw error;
    }
}

export const adjustBrightness = async (input, brightness, setMediaList) => {
    // Convert brightness to decimal if it's a whole number
    brightness = brightness > 1 ? brightness / 100 : brightness;
    console.log('Adjusting brightness:', brightness);
    return processVideoMediaList(
        input,
        `Brightness Adjusted (${brightness})`,
        [
            '-i', 'input.mp4',
            '-vf', `eq=brightness=${brightness}`,
            '-c:v', 'libx264',
            'output.mp4'
        ], 
        setMediaList
    );
};

export const changeAspectRatio = async (input, width, height, setMediaList) => {
    return processVideoMediaList(
        input,
        `Aspect Ratio Changed (${width}x${height})`,
        [
            '-i', 'input.mp4',
            '-vf', `scale=${width}:${height},setsar=1:1`,
            '-c:a', 'copy',
            'output.mp4'
        ],
        setMediaList
    );
};

export const applyColorGrading = async (input, contrast, gamma, saturation, setMediaList) => {
    return processVideoMediaList(
        input,
        `Color Graded (C:${contrast} G:${gamma} S:${saturation})`,
        [
            '-i', 'input.mp4',
            '-vf', `eq=contrast=${contrast}:gamma=${gamma}:saturation=${saturation}`,
            '-c:v', 'libx264',
            'output.mp4'
        ],
        setMediaList
    );
};

export const adjustSaturation = async (input, saturation, setMediaList) => {
    return processVideoMediaList(
        input,
        `Saturation Adjusted (${saturation})`,
        [
            '-i', 'input.mp4',
            '-vf', `eq=contrast=1.0:gamma=1.0:saturation=${saturation}`,
            '-c:v', 'libx264',
            'output.mp4'
        ],
        setMediaList
    );
};

export const addBlurEffect = async (input, blurStrength, setMediaList) => {
    return processVideoMediaList(
        input,
        `Blur Applied (${blurStrength})`,
        [
            '-i', 'input.mp4',
            '-vf', `gblur=sigma=${blurStrength}`,
            '-c:v', 'libx264',
            'output.mp4'
        ],
        setMediaList
    );
};

export const convertToGrayscale = async (input, setMediaList) => {
    return processVideoMediaList(
        input,
        'Grayscale',
        [
            '-i', 'input.mp4',
            '-vf', 'hue=s=0',
            '-c:v', 'libx264',
            'output.mp4'
        ],
        setMediaList
    );
};

export const applyFadeIn = async (input, duration, setMediaList) => {
    return processVideoMediaList(
        input,
        `Fade In (${duration}s)`,
        [
            '-i', 'input.mp4',
            '-vf', `fade=t=in:st=0:d=${duration}`,
            '-c:v', 'libx264',
            'output.mp4'
        ],
        setMediaList
    );
};

export const applyFadeOut = async (input, duration, setMediaList) => {
    return processVideoMediaList(
        input,
        `Fade Out (${duration}s)`,
        [
            '-i', 'input.mp4',
            '-vf', `fade=t=out:st=3:d=${duration}`, // Change `st=3` to match the actual video duration - fade-out duration
            '-c:v', 'libx264',
            'output.mp4'
        ],
        setMediaList
    );
};

export const trimVideo = async (input, startTime, endTime, setMediaList) => {
    console.log('Trimming video:', startTime, 'to', endTime);
    try {
        const outputFileName = 'output.mp4';
        const data = await processVideo(input, [
            '-i', 'input.mp4',
            '-ss', `${startTime}`,
            '-t', `${endTime - startTime}`,
            '-c:v', 'libx264',  // Explicitly set video codec
            '-c:a', 'aac',      // Explicitly set audio codec
            '-preset', 'ultrafast',  // Speed up encoding
            outputFileName
        ], outputFileName);

        console.log('Video trimmed successfully');
        // Create a blob from the Uint8Array data
        const outputBlob = new Blob([data.buffer], { type: 'video/mp4' });
        const outputFile = new File([outputBlob], 'trimmed.mp4', { type: 'video/mp4' });
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
            name: `Trimmed (${startTime}s-${endTime}s)`,
            duration: video.duration,
            thumbnails: [], // Thumbnails will be generated by MediaList component
            loading: false,
            type: 'video/mp4',
            hidden: true  // Add hidden property
        };

        // Add to media list
        setMediaList(prev => [...prev, newMedia]);
        
        return newMedia.id;
    } catch (error) {
        console.error('Error trimming video:', error);
        throw error;
    }
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