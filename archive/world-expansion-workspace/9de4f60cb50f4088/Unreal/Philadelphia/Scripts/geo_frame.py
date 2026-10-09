import math

ORIGIN = (-75.16, 39.95)
SX = 111320 * math.cos(math.radians(ORIGIN[1]))
SY = 111320

def _validate_args(*args):
    for arg in args:
        if not isinstance(arg, (int, float)) or not math.isfinite(arg) or isinstance(arg, bool):
            raise ValueError("Invalid argument: must be finite int/float")

def to_unreal(lon, lat, height, origin_height=0):
    _validate_args(lon, lat, height, origin_height)
    
    if not (-180 <= lon <= 180):
        raise ValueError("Longitude must be between -180 and 180")
    if not (-90 <= lat <= 90):
        raise ValueError("Latitude must be between -90 and 90")
    
    x = (lon - ORIGIN[0]) * SX * 100
    y = -(lat - ORIGIN[1]) * SY * 100
    z = (height - origin_height) * 100
    
    return (x, y, z)


def from_unreal(x, y, z, origin_height=0):
    _validate_args(x, y, z, origin_height)
    
    lon = (x / (SX * 100)) + ORIGIN[0]
    lat = - (y / (SY * 100)) + ORIGIN[1]
    height = (z / 100) + origin_height
    
    return (lon, lat, height)