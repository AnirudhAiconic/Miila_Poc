from abc import ABC, abstractmethod

import numpy as np


# TODO Add context manager
class VideoInput(ABC):
    @abstractmethod
    def read_frame(self) -> np.ndarray:
        """Read and return the next video frame. Returns None if no more frames."""
        pass

    @abstractmethod
    def is_open(self) -> bool:
        """Return whether the input stream is still open."""
        pass

    @abstractmethod
    def close(self):
        """Clean up any resources (close file handles, etc.)."""
        pass
