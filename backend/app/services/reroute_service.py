from typing import List, Dict, Any, Optional
import math

from app.core.storage import get_port_coordinates, list_ports


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in kilometers."""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def get_best_route(origin: str, destination: str) -> List[List[float]]:
    """Get direct route between two ports."""
    start = get_port_coordinates(origin)
    end = get_port_coordinates(destination)

    if start is None or end is None:
        return []

    return [[start[0], start[1]], [end[0], end[1]]]


def get_alternative_routes(origin: str, destination: str, count: int = 2) -> List[Dict[str, Any]]:
    """Generate alternative routes via intermediate ports."""
    origin_coords = get_port_coordinates(origin)
    destination_coords = get_port_coordinates(destination)
    
    if origin_coords is None or destination_coords is None:
        return []
    
    direct_distance = _haversine_distance(
        origin_coords[0], origin_coords[1],
        destination_coords[0], destination_coords[1]
    )
    
    # Get all available ports
    all_ports = list_ports()
    
    positive_routes = []
    fallback_routes = []
    
    for port in all_ports:
        if port["name"].lower() in [origin.lower(), destination.lower()]:
            continue
        
        intermediate_coords = get_port_coordinates(port["name"])
        if intermediate_coords is None:
            continue
        
        # Calculate distance via intermediate port
        distance_to_intermediate = _haversine_distance(
            origin_coords[0], origin_coords[1],
            intermediate_coords[0], intermediate_coords[1]
        )
        distance_from_intermediate = _haversine_distance(
            intermediate_coords[0], intermediate_coords[1],
            destination_coords[0], destination_coords[1]
        )
        
        total_distance = distance_to_intermediate + distance_from_intermediate
        distance_saved = direct_distance - total_distance
        distance_saved_percent = (distance_saved / direct_distance * 100) if direct_distance > 0 else 0

        route = {
            "origin": origin,
            "intermediate_port": port["name"],
            "destination": destination,
            "route_coords": [
                [origin_coords[0], origin_coords[1]],
                [intermediate_coords[0], intermediate_coords[1]],
                [destination_coords[0], destination_coords[1]]
            ],
            "distance_km": round(total_distance, 2),
            "direct_distance_km": round(direct_distance, 2),
            "distance_saved_km": round(distance_saved, 2),
            "distance_saved_percent": round(distance_saved_percent, 2),
            "estimated_cost_change": round(-distance_saved * 0.05, 2),  # Rough estimate: $0.05 per km saved
            "estimated_days_saved": round(distance_saved / 500, 1),  # Rough estimate: 500 km per day
        }

        if distance_saved_percent > 5:
            positive_routes.append(route)
        else:
            fallback_routes.append(route)
    
    # Prefer genuinely beneficial routes, but fall back to the best available options
    positive_routes.sort(key=lambda x: x["distance_saved_percent"], reverse=True)
    if positive_routes:
        return positive_routes[:count]

    fallback_routes.sort(key=lambda x: x["distance_saved_percent"], reverse=True)
    return fallback_routes[:count]
