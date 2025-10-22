import os
import time
from typing import Optional

import cv2
import numpy as np

from .VideoInput import VideoInput


class SingleImageFromDisk(VideoInput):
    def __init__(self, image_path: str, frame_period: float = 0.033):
        """
        :param image_path: Path to image
        :param frame_period: Period between frames in seconds (default 30 FPS)
        """
        self.image_path = image_path
        self.frame_period = frame_period
        self._open = True

    def read_frame(self) -> np.ndarray:
        if not self.is_open():
            return None
        frame = cv2.imread(self.image_path)

        return frame

    def is_open(self) -> bool:
        return self._open

    def close(self):
        self._open = False
