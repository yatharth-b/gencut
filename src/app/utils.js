import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit

const loadFFmpeg = async () => {
    const ffmpegInstance = new FFmpeg();
    try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd';
        await ffmpegInstance.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        console.log('FFmpeg is ready!');
        return ffmpegInstance;
    } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        return null;
    }
};

const writeInputFile = async (ffmpeg, input) => {
    let fileData;
    try {
        if (typeof input === 'string') {
            const response = await fetch(input);
            const contentLength = response.headers.get('content-length');
            
            if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
                throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
            }
            
            fileData = new Uint8Array(await response.arrayBuffer());
        } else {
            if (input.byteLength > MAX_FILE_SIZE) {
                throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
            }
            fileData = new Uint8Array(input);
        }
        
        await ffmpeg.writeFile('input.mp4', fileData);
        const writtenFile = await ffmpeg.readFile('input.mp4');
        console.log('File written to FS:', writtenFile.length, 'bytes');
    } catch (error) {
        console.error('Error writing input file:', error);
        throw error;
    }
};

const getOutputFile = async (ffmpeg, type = 'video/mp4') => {
    try {
        const data = await ffmpeg.readFile('output.mp4');
        await ffmpeg.deleteFile('input.mp4');
        await ffmpeg.deleteFile('output.mp4');
        
        const blob = new Blob([data.buffer], { type });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'processed_video.mp4';
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        return url;
    } catch (error) {
        console.error('Error getting output file:', error);
        throw error;
    }
};

const processVideo = async (input, ffmpegCommands, type = 'video/mp4') => {
    const ffmpeg = await loadFFmpeg();
    if (!ffmpeg) throw new Error('Failed to load FFmpeg');
    
    try {
        await writeInputFile(ffmpeg, input);
        await ffmpeg.exec(ffmpegCommands);
        return await getOutputFile(ffmpeg, type);
    } catch (error) {
        console.error('Error processing video:', error);
        throw error;
    }
};

export const adjustBrightness = async (input, start = null, end = null, brightness) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', `eq=brightness=${brightness}`,
        '-c:v', 'libx264', '-c:a', 'aac',
        'output.mp4'
    ]);
};

export const changeAspectRatio = async (input, start = null, end = null, width, height) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', `scale=${width}:${height},setsar=1:1`,
        '-c:a', 'copy',
        'output.mp4'
    ]);
};

export const applyColorGrading = async (input, start = null, end = null, contrast, gamma, saturation) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', `eq=contrast=${contrast}:gamma=${gamma}:saturation=${saturation}`,
        '-c:v', 'libx264', '-c:a', 'aac',
        'output.mp4'
    ]);
};

export const adjustSaturation = async (input, start = null, end = null, saturation) => {
    return applyColorGrading(input, null, null, 1.0, 1.0, saturation);
};

export const addBlurEffect = async (input, start = null, end = null, blurStrength) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', `gblur=sigma=${blurStrength}`,
        '-c:v', 'libx264', '-c:a', 'aac',
        'output.mp4'
    ]);
};

export const convertToGrayscale = async (input, start = null, end = null) => {
    return processVideo(input, [
        '-i', 'input.mp4',
        '-vf', 'hue=s=0',
        '-c:v', 'libx264', '-c:a', 'aac',
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