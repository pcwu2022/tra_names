import pandas as pd
import re
import numpy as np
from pyproj import Transformer

df_passenger = pd.read_csv('tra_passenger.csv', encoding='utf-8')
df_point = pd.read_csv('tra_point.csv', encoding='utf-8')

# If you want to keep all rows from both DataFrames (outer join)
df_merged = pd.merge(df_passenger, df_point, on="Name", how="outer")

# Extract TM2 coordinates from Point column using regex
def extract_tm2_coords(point_str):
    if isinstance(point_str, str):
        match = re.search(r'Point \(([0-9.-]+) ([0-9.-]+)\)', point_str)
        if match:
            return float(match.group(1)), float(match.group(2))
    return np.nan, np.nan

# Apply function to extract TM2 coordinates
df_merged[['tm2_x', 'tm2_y']] = pd.DataFrame(df_merged['Point'].apply(extract_tm2_coords).tolist(), index=df_merged.index)

# Create transformer from TM2 (EPSG:3826) to WGS84 (EPSG:4326)
transformer = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)

# Convert TM2 coordinates to latitude and longitude
def convert_to_latlon(row):
    if pd.notna(row['tm2_x']) and pd.notna(row['tm2_y']):
        lon, lat = transformer.transform(row['tm2_x'], row['tm2_y'])
        return lat, lon
    return np.nan, np.nan

# Apply conversion and add latitude and longitude columns
df_merged[['latitude', 'longitude']] = pd.DataFrame(df_merged.apply(convert_to_latlon, axis=1).tolist(), index=df_merged.index)

# Output to CSV
df_merged.to_csv('tra_data.csv', index=False, encoding='utf-8')

# Output to JSON
df_merged.to_json('tra_data.json', orient='records', force_ascii=False)