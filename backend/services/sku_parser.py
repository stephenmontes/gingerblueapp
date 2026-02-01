def get_sku_match_key(sku: str) -> str:
    """Extract last two groups from SKU for matching.
    E.g., 'FRAME-BLK-SM' -> 'BLK-SM', 'PROD-001-B-L' -> 'B-L'"""
    parts = sku.split("-")
    if len(parts) >= 2:
        return f"{parts[-2]}-{parts[-1]}"
    return sku

def parse_sku_details(sku: str) -> dict:
    """Parse SKU to extract color and size information.
    Common patterns:
    - FRAME-BLK-SM (product-color-size)
    - PROD-001-B-L (product-number-color-size)
    """
    parts = sku.upper().split("-")
    
    color_map = {
        "BLK": "Black", "B": "Black", "BLACK": "Black",
        "WHT": "White", "W": "White", "WHITE": "White",
        "NAT": "Natural", "N": "Natural", "NATURAL": "Natural",
        "BRN": "Brown", "BROWN": "Brown",
        "GRY": "Gray", "GRAY": "Gray", "GREY": "Grey",
        "RED": "Red", "BLU": "Blue", "GRN": "Green",
    }
    
    size_map = {
        "XS": "XS", "S": "S", "SM": "S", "SMALL": "S",
        "M": "M", "MD": "M", "MED": "M", "MEDIUM": "M",
        "L": "L", "LG": "L", "LARGE": "L",
        "XL": "XL", "XXL": "XXL", "XLARGE": "XL",
        "8X10": "8x10", "11X14": "11x14", "16X20": "16x20",
    }
    
    color = ""
    size = ""
    
    # Try to find color and size in the SKU parts
    for part in parts:
        if part in color_map and not color:
            color = color_map[part]
        elif part in size_map and not size:
            size = size_map[part]
    
    # If not found, use last two parts as fallback
    if len(parts) >= 2:
        if not color:
            potential_color = parts[-2]
            color = color_map.get(potential_color, potential_color)
        if not size:
            potential_size = parts[-1]
            size = size_map.get(potential_size, potential_size)
    
    return {"color": color, "size": size, "original_sku": sku}
