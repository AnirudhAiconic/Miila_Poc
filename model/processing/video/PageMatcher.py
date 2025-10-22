from abc import ABC, abstractmethod

from model.Page import Page


class PageMatcher(ABC):
    @abstractmethod
    def set_catalog(self, catalog):
        """Set page catalog where to search for a matched page"""
        pass

    @abstractmethod
    def match(self, input_img) -> Page | None:
        """Find a corresponding page. None if not found."""
        pass
