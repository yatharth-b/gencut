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

    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, secure_filename(video_file.name))
    video_file.save(video_path)

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []
    frame_count = 0

    attrs = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_count % int(fps) == 0:
            # Convert frame to JPEG
            _, buffer = cv2.imencode('.jpg', frame)
            base64_frame = base64.b64encode(buffer).decode('utf-8')
            frames.append(gpt_frame_desc(base64_frame))

        
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
        
        image_desc, attrs = preprocess_image(video_duration, video_file)
        # transcription = get_transcript(video_file)
        print("preprocessing done")
        return jsonify({
            'image_description': image_desc,
            'image_attr': attrs,
            'transcription': ""
        })

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        print("in chat")
        data = request.get_json()
        messages = data.get('messages', [])
        print(messages)
        clip_contexts = data.get('clipContexts', [])

        print(clip_contexts)
        
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                "role": msg['role'],
                "content": msg['content']
            })

        formatted_messages.append({
            "role": "user",
            "content": f"here is the context for all my videos: \n{'\n'.join(clip_contexts)}"
        })


        # messages = [
        #     {
        #         "role": "system",
        #         "content": "You are a helpful assistant that helps users understand and edit videos. Use the provided clip information to give accurate answers."
        #     },
        #     {
        #         "role": "assistant",
        #         "content": context_message
        #     },
        #     {
        #         "role": "user",
        #         "content": user_message
        #     }
        # ]

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=formatted_messages,
            functions=[AVAILABLE_FUNCTIONS["trim_video"]],
            function_call="auto",
            max_tokens=500
        )

        print(response)

        assistant_message = response.choices[0].message
        
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

def formatTime(seconds):
    minutes = int(seconds // 60)
    seconds = int(seconds % 60)
    return f"{minutes}:{seconds:02d}"

@app.route('/api/health', methods=['GET'])
def check_health():
    return jsonify({'healthy': 'true'})

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(host='0.0.0.0', port=5050, debug=True)