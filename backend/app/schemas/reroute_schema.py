from typing import List, Optional
from pydantic import BaseModel


class RouteOption(BaseModel):
    """Represents a single route option."""
    origin: str
    intermediate_port: Optional[str] = None
    destination: str
    route_coords: List[List[float]]
    distance_km: float
    direct_distance_km: float
    distance_saved_km: float
    distance_saved_percent: float
    estimated_cost_change: float
    estimated_days_saved: float


class AvailableRoutesResponse(BaseModel):
    """Response with available route options for a shipment."""
    shipment_id: str
    current_route: List[List[float]]
    current_distance_km: float
    alternative_routes: List[RouteOption]


class RerouteExecutionRequest(BaseModel):
    """Request to execute a reroute decision."""
    shipment_id: str
    route_index: int
    execution_notes: Optional[str] = None


class RerouteHistory(BaseModel):
    """Record of a reroute decision."""
    id: int
    shipment_id: str
    original_origin: str
    original_destination: str
    intermediate_port: Optional[str] = None
    route_index: int
    distance_saved_percent: float
    estimated_cost_change: float
    estimated_days_saved: float
    decision_status: str
    created_at: str
    executed_at: Optional[str] = None
    execution_notes: Optional[str] = None


class RerouteHistoryResponse(BaseModel):
    """Response with reroute history for a shipment."""
    shipment_id: str
    total_reroutes: int
    pending_reroutes: int
    executed_reroutes: int
    history: List[RerouteHistory]
