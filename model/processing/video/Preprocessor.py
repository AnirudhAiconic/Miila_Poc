import cv2
import numpy as np

#TODO still no filtering, thresholding and so on is implemented
class Preprocessor:
    def __init__(self, verbose=False):
        self.verbose = verbose

    def process(self, inputImg) -> np.ndarray:
        outputImg = cv2.cvtColor(inputImg, cv2.COLOR_BGR2GRAY)

        if self.verbose:
            self._draw(inputImg, outputImg)

        return outputImg

    def _draw(self, input, processed):
        scale = 768 / input.shape[1]
        inputToShow = cv2.resize(input, (0, 0), fx=scale, fy=scale)
        cv2.imshow("Preprocessed: Input Image", inputToShow)
        scale = 768 / processed.shape[1]
        processedToShow = cv2.resize(processed, (0, 0), fx=scale, fy=scale)
        cv2.imshow("Preprocessor: Output Image", processedToShow)
        cv2.waitKey(0)


if __name__ == "__main__":
    from model.input.video.SingleImageFromDisk import SingleImageFromDisk

    img_orig = SingleImageFromDisk("worksheet.jpg").read_frame()
    img_filled = SingleImageFromDisk("page_snapshot.jpg").read_frame()

    preprocessor = Preprocessor(verbose=True)
    preprocessedOrigImg = preprocessor.process(img_orig)
    preprocessedFilledImg = preprocessor.process(img_filled)
