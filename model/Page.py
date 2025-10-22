import json

import cv2

from .processing.video.Preprocessor import Preprocessor

PAGE_PREPROCESSOR = Preprocessor()


class Page:
    """Container with the page related information"""

    def __init__(self, page_path_base_name: str):
        self.img_orig = cv2.imread(page_path_base_name + ".jpg")
        self._process_orig_img()

        self.img_input = None

    def _process_orig_img(self):
        self.img_orig_processed = PAGE_PREPROCESSOR.process(self.img_orig)

    def set_img_input(self, img):
        self.img_input = img
