from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


OUT_PATH = Path("web/public/data/cbd-basemap.json")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

SOUTH = -36.859
WEST = 174.7589
NORTH = -36.842
EAST = 174.7712

HIGHWAY_KINDS = {
    "primary": "primary",
    "secondary": "primary",
    "tertiary": "secondary",
    "unclassified": "secondary",
    "residential": "secondary",
    "service": "lane",
    "pedestrian": "lane",
    "living_street": "lane",
    "footway": "lane",
    "path": "lane",
    "steps": "lane",
}


def compact_json_dump(data: dict[str, Any], path: Path) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def fetch_overpass() -> dict[str, Any]:
    query = f"""
    [out:json][timeout:45];
    (
      way["building"]({SOUTH},{WEST},{NORTH},{EAST});
      way["highway"]["highway"!~"motorway|trunk"]({SOUTH},{WEST},{NORTH},{EAST});
    );
    out body;
    >;
    out skel qt;
    """
    request = urllib.request.Request(
        OVERPASS_URL,
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": "foottraffic-cbd-basemap/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def way_coordinates(way: dict[str, Any], nodes: dict[int, dict[str, float]]) -> list[list[float]]:
    coordinates = []
    for node_id in way.get("nodes", []):
        node = nodes.get(node_id)
        if node:
            coordinates.append([round(node["lon"], 7), round(node["lat"], 7)])
    return coordinates


def main() -> None:
    overpass = fetch_overpass()
    nodes = {
        element["id"]: {"lat": element["lat"], "lon": element["lon"]}
        for element in overpass["elements"]
        if element["type"] == "node"
    }

    buildings = []
    roads = []

    for element in overpass["elements"]:
        if element["type"] != "way":
            continue

        tags = element.get("tags", {})
        coordinates = way_coordinates(element, nodes)
        if len(coordinates) < 2:
            continue

        if "building" in tags and coordinates[0] == coordinates[-1]:
            buildings.append(
                {
                    "id": str(element["id"]),
                    "points": coordinates,
                }
            )
            continue

        highway = tags.get("highway")
        kind = HIGHWAY_KINDS.get(highway)
        if kind:
            roads.append(
                {
                    "id": str(element["id"]),
                    "name": tags.get("name", ""),
                    "kind": kind,
                    "points": coordinates,
                }
            )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    compact_json_dump(
        {
            "bounds": {
                "south": SOUTH,
                "west": WEST,
                "north": NORTH,
                "east": EAST,
            },
            "buildings": buildings,
            "roads": roads,
        },
        OUT_PATH,
    )

    print(f"Buildings: {len(buildings):,}")
    print(f"Roads: {len(roads):,}")
    print(f"Saved: {OUT_PATH}")


if __name__ == "__main__":
    main()
