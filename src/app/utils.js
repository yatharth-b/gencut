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

const getOutputFile = async (ffmpeg) => {
    try {
        // Add a small delay to ensure file writing is complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // List files in FS to debug
        const files = ffmpeg.FS('readdir', '/');
        console.log('Files in FFmpeg filesystem:', files);

        // Check if output file exists
        if (!files.includes('output.mp4')) {
            throw new Error('Output file not found in FFmpeg filesystem');
        }

        const data = ffmpeg.FS('readFile', 'output.mp4');
        if (!data || !data.buffer) {
            throw new Error('Invalid output data from FFmpeg');
        }

        const outputBlob = new Blob([data.buffer], { type: 'video/mp4' });
        return URL.createObjectURL(outputBlob);
    } catch (error) {
        console.error('Detailed error in getOutputFile:', error);
        throw new Error(`Error reading output file: ${error.message}`);
    }
};

const processVideo = async (input, ffmpegCommands) => {
    try {
        await loadFFmpeg();
        await writeInputFile(input);
        

        console.log('Running FFmpeg command:', ffmpegCommands);
        await ffmpeg.run(...ffmpegCommands);
        const data = ffmpeg.FS('readFile', 'output.mp4');
        
        console.log('Output data:', data);

        try {
            ffmpeg.FS('unlink', 'input.mp4');
            ffmpeg.FS('unlink', 'output.mp4');
        } catch (e) {
            console.log('Cleanup error:', e);
        }
        
        // Return the output data
        getOutputFile(data);
        // return data; 
    } catch (error) {
        console.error('Error processing video:', error);
        throw error;
    }
};

export const adjustBrightness = async (input, brightness, setMediaList) => {
    console.log('Adjusting brightness:', brightness);
    
    try {
        const outputUrl = await processVideo(input, [
            '-i', 'input.mp4',
            '-vf', `eq=brightness=${brightness}`,
            '-c:v', 'libx264',
            '/output.mp4'
        ]);

        console.log('Output is made');  

        // Create a new media entry
        const newMedia = {
            id: `media-${Date.now()}`,
            clipId: input.clipId || null,
            name: `Brightness Adjusted Video (${brightness})`,
            url: outputUrl,
            duration: input.duration || 0,
            thumbnails: [], 
            type: 'video/mp4',
            imageDescriptions: input.imageDescriptions || [],
            imageAttributes: input.imageAttributes || [],
            transcription: input.transcription || []
        };

        // Add the new media to mediaList
        setMediaList(prevList => [...prevList, newMedia]);
        
        return newMedia.id; // Return the new media ID for reference
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