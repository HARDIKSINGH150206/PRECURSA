from pydantic import BaseModel, Field


class RiskWeights(BaseModel):
    weather: int = 42
    congestion: int = 28
    carrier: int = 18
    tariff: int = 12


class WeatherSettings(BaseModel):
    wind: int = 45
    rain: int = 55
    visibility: int = 35
    realtime: bool = True
    refresh_interval: str = "30s"


class VesselSettings(BaseModel):
    enabled: bool = True
    refresh_interval: str = "20s"
    filters: dict[str, bool] = Field(default_factory=lambda: {
        "activeOnly": True,
        "highSpeed": False,
        "congestedRoute": True,
        "weatherExposure": True,
    })


class AlertSettings(BaseModel):
    weather: bool = True
    ais: bool = True
    delay: bool = True
    tariff: bool = False
    threshold: int = 68
    channel: str = "In-app"


class DashboardPreferences(BaseModel):
    widget_visibility: dict[str, bool] = Field(default_factory=lambda: {
        "map": True,
        "alerts": True,
        "weather": True,
        "analytics": True,
        "table": True,
    })
    surface_theme: str = "dark"


class AiCopilotSettings(BaseModel):
    enabled: bool = True
    mode: str = "AI"


class OperatorSettings(BaseModel):
    risk_weights: RiskWeights = Field(default_factory=RiskWeights)
    auto_weighting: bool = True
    weather_settings: WeatherSettings = Field(default_factory=WeatherSettings)
    vessel_settings: VesselSettings = Field(default_factory=VesselSettings)
    alerts: AlertSettings = Field(default_factory=AlertSettings)
    dashboard_preferences: DashboardPreferences = Field(default_factory=DashboardPreferences)
    ai_copilot: AiCopilotSettings = Field(default_factory=AiCopilotSettings)
    updated_at: str | None = None
