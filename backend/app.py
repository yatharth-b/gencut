from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
from openai import OpenAI
from dotenv import load_dotenv
import cv2
import numpy as np
import base64
from werkzeug.utils import secure_filename
import tempfile
from moviepy import VideoFileClip
import utils
import math
from concurrent.futures import ThreadPoolExecutor
import atexit

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Define the available functions
def trim_video(start_time: float, end_time: float) -> dict:
    """
    Function to trim a video between specified start and end times.
    """
    return {
        "action": "trim_video",
        "parameters": {
            "start_time": start_time,
            "end_time": end_time
        }
    }

# Define the available functions for OpenAI
AVAILABLE_FUNCTIONS = {
    "trim_video": {
        "name": "trim_video",
        "description": "Trim a video between specified start and end times",
        "parameters": {
            "type": "object",
            "properties": {
                "start_time": {
                    "type": "number",
                    "description": "Start time in seconds"
                },
                "end_time": {
                    "type": "number",
                    "description": "End time in seconds"
                }
            },
            "required": ["start_time", "end_time"]
        }
    }
}

# Add conversation history storage
conversation_history = []

# At the top of the file, after imports
executor = ThreadPoolExecutor(max_workers=4)  # Create a global executor

def gpt_frame_desc(base64_image):
    messages = [
        {
            "role": "system",
            "content": "You are a helpful assistant for the blind. describe the frame as specificely as you can. be specific in terms of the colors in the frame, what might be happening to the best of your knowledge. be as specific as you can."
        },
        {"role": "user", "content": [
                {"type": "text", "text": f"Here is a frame from a video. Describe it vividly."},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_image}"
                    }
                }
            ]}

    ]

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=500
    )

    return response.choices[0].message.content


def preprocess_image(video_duration, video_file):
    # returns image description per second and 
    print("in preprocess image")
    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, secure_filename(video_file.name))
    video_file.save(video_path)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []
    frame_count = 0

    attrs = []

    with ThreadPoolExecutor() as executor:
        while cap.isOpened():
            print("in while loop")
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % int(fps) == 0:
                # Convert frame to JPEG
                _, buffer = cv2.imencode('.jpg', frame)
                base64_frame = base64.b64encode(buffer).decode('utf-8')
                
                # Submit the gpt_frame_desc call to the executor
                future = executor.submit(gpt_frame_desc, base64_frame)
                frames.append(future)  # Store the future object

                attrs.append({
                    "rgb_level": utils.get_rgb_levels(frame),
                    "saturation": utils.get_saturation(frame),
                    "contrast": utils.get_contrast(frame),
                    "brightness": utils.get_brightness(frame)
                })
            
            frame_count += 1

    cap.release()
    
    os.remove(video_path)
    os.rmdir(temp_dir)

    # Wait for all futures to complete and retrieve results
    frames = [future.result() for future in frames]

    return frames, attrs

def get_transcript(video_file):
    print("in getting transcript")
    video_temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(video_temp_dir, f"{secure_filename(video_file.name)}")
    video_file.save(video_path)
    print(f"video path: {video_path}")
    print('calling moviepi')
    audio = VideoFileClip(video_path).audio

    audio_temp_dir = tempfile.mkdtemp()
    audio_path = os.path.join(audio_temp_dir, secure_filename(f'audio.wav'))
    print("audiopath")
    audio.write_audiofile(audio_path)

    audio_file = open(audio_path, "rb")
    transcript = client.audio.transcriptions.create(
        file=audio_file,
        model="whisper-1",
        response_format="verbose_json",
        timestamp_granularities=["word"]
    )

    sec_transcription = [[] for _ in range(math.ceil(transcript.duration))]

    for word in transcript.words:
        for sec in range(int(word.start), math.ceil(word.end)):
            sec_transcription[sec].append(word.word)

    for sec in range(len(sec_transcription)):
        sec_transcription[sec] = ' '.join(sec_transcription[sec])
    
    # return sec_transcription
    os.remove(video_path)
    os.rmdir(video_temp_dir)
    os.remove(audio_path)
    os.rmdir(audio_temp_dir)
    return sec_transcription


@app.route('/api/preprocess', methods=['POST'])
def preprocess():
    logger.info("Started processing")
    try:
        video_duration = float(request.form.get('duration', 0))
        video_file = request.files.get('video')

        if not video_file:
            return jsonify({'error': 'No video file provided'}), 400

        # Use the global executor
        image_desc_future = executor.submit(preprocess_image, video_duration, video_file)
        # transcription_future = executor.submit(get_transcript, video_file)

        image_desc, attrs = image_desc_future.result()
        # transcription = transcription_future.result()

        return jsonify({
            'image_description': image_desc,
            'image_attr': attrs,
            'transcription': ''
        })

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        user_message = data.get('message')
        context = data.get('context', {})
        
        # Create context message from image descriptions and transcription
        context_message = "Video Analysis:\n"
        context_message += "\n".join(context.get('imageDescriptions', []))
        context_message += "\n\nTranscription:\n"
        context_message += " ".join(context.get('transcription', []))

        messages = [
            {
                "role": "system",
                "content": "You are a helpful assistant that helps users trim videos or answer questions based on the video. Use the provided video analysis and transcription to give accurate answers."
            },
            {
                "role": "assistant",
                "content": context_message
            },
            {
                "role": "user",
                "content": user_message
            }
        ]

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            functions=[AVAILABLE_FUNCTIONS["trim_video"]],
            function_call="auto",
            max_tokens=500
        )

        assistant_message = response.choices[0].message
        print(assistant_message)
        # Update conversation history
        # conversation_history.append({
        #     "role": "user",
        #     "content": user_message  # Store text only for history
        # })
        # conversation_history.append({
        #     "role": "assistant",
        #     "content": assistant_message.content
        # })

        print("Assistant message:", assistant_message)

        # If there's a function call
        if hasattr(assistant_message, 'function_call') and assistant_message.function_call:
            function_name = assistant_message.function_call.name
            function_args = eval(assistant_message.function_call.arguments)
            
            result = trim_video(**function_args)
            return jsonify({
                "type": "function_call",
                "result": result,
                "message": assistant_message.content or "I'll help you trim the video."
            })

        # If it's just a regular message
        return jsonify({
            "type": "message",
            "message": assistant_message.content
        })

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def check_health():
    return jsonify({'healthy': 'true'})

# Ensure to shut down the executor when the application is stopped
atexit.register(executor.shutdown)

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(host='0.0.0.0', port=5050, debug=True)