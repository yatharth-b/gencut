
import cv2
import numpy as np

def get_color_grading(image):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    return np.mean(a), np.mean(b)  # Approximate color grading

def get_rgb_levels(image):
    b, g, r = cv2.split(image)
    return {
        "Red": np.mean(r),
        "Green": np.mean(g),
        "Blue": np.mean(b)
    }

def get_saturation(image):
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    return np.mean(hsv[:, :, 1])  # Saturation channel (S)

def get_contrast(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return np.std(gray)

def get_blur(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F).var()
    return laplacian  # Lower values indicate more blur

def is_grayscale(image):
    if len(image.shape) < 3 or image.shape[2] == 1:
        return True  # Single-channel image is grayscale
    
    b, g, r = cv2.split(image)
    return np.array_equal(b, g) and np.array_equal(g, r)

def get_brightness(image):
    return np.mean(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))

