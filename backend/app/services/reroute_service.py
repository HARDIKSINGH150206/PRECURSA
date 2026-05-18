from typing import List

from app.core.storage import get_port_coordinates


def get_best_route(origin: str, destination: str) -> List[List[float]]:
    start = get_port_coordinates(origin)
    end = get_port_coordinates(destination)

    if start is None or end is None:
        return []

    return [[start[0], start[1]], [end[0], end[1]]]
