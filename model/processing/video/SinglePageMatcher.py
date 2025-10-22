import copy

import cv2
import numpy as np

from model.Page import PAGE_PREPROCESSOR, Page
from model.processing.video.PageMatcher import PageMatcher

NUM_ORB_FEATURES = 5000


# Preprocessor is used in multiple places, how to guarantee that we supply preprocessed image here?
class SinglePageMatcher(PageMatcher):
    def __init__(self, base_name_orig, verbose=False):
        self.orb = cv2.ORB_create(NUM_ORB_FEATURES)
        self.bfMatcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

        page = Page(base_name_orig)
        self.set_catalog(page)

        self.verbose = verbose

    def set_catalog(self, page: Page):
        """Set page catalog where to search for a matched page"""
        self.catalog = page
        img = page.img_orig_processed
        self.height, self.width = img.shape[:2]
        # TODO Does it makes sense to make this information part of the Page instance?
        # or keep this info in a dict. Make Page hashable
        self.kpOrig, self.desOrig = self.orb.detectAndCompute(img, None)

    def match(self, input_img) -> np.ndarray | None:
        """Find a corresponding page. None if not found."""
        input_img = PAGE_PREPROCESSOR.process(input_img)
        kpIn, desIn = self.orb.detectAndCompute(input_img, None)
        matches = self.bfMatcher.match(self.desOrig, desIn)
        matches = sorted(matches, key=lambda x: x.distance)
        srcPts = np.float32([self.kpOrig[m.queryIdx].pt for m in matches]).reshape(
            -1, 1, 2
        )
        dstPts = np.float32([kpIn[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(dstPts, srcPts, cv2.RANSAC, 5.0)
        warped = cv2.warpPerspective(input_img, H, (self.width, self.height))


        if self.verbose:
            result = copy.deepcopy(self.catalog)
            result.set_img_input(warped)
            self._drawMatches(matches, result, kpIn)
            self._drawWarped(warped)
            cv2.waitKey(0)

        return warped

    def _drawMatches(self, matches, page, kpIn):
        imgMatches = cv2.drawMatches(
            page.img_orig,
            self.kpOrig,
            page.img_input,
            kpIn,
            matches[:20],
            None,
            flags=2,
        )
        scale = 1024 / imgMatches.shape[1]
        matchesShow = cv2.resize(imgMatches, (0, 0), fx=scale, fy=scale)
        cv2.imshow("matches_preview", matchesShow)

    def _drawWarped(self, warped):
        scale = 768 / warped.shape[1]
        warpedShow = cv2.resize(warped, (0, 0), fx=scale, fy=scale)
        cv2.imshow("aligned_filled", warpedShow)


if __name__ == "__main__":
    from model.input.video.SingleImageFromDisk import SingleImageFromDisk

    pageMatcher = SinglePageMatcher("worksheet", verbose=True)

    img_filled = SingleImageFromDisk("page_snapshot.jpg").read_frame()
    img_mathced = pageMatcher.match(img_filled)

    print("Matching is complete.")
