"""Generate an illustrative electric wheelchair as an uncompressed GLB."""
import json
import math
import struct
from pathlib import Path

materials = [
    ("Upholstery", [.065, .08, .09, 1], 0),
    ("Frame", [.32, .37, .39, 1], .65),
    ("Rubber", [.026, .031, .034, 1], 0),
    ("Teal", [.04, .48, .43, 1], .25),
    ("Hub", [.15, .18, .20, 1], .6),
]
triangles = [[] for _ in materials]


def face(material, a, b, c, d):
    triangles[material].extend((a, b, c, a, c, d))


def box(center, size, material):
    x, y, z = center
    w, h, d = (value / 2 for value in size)
    v = [(x + i*w, y + j*h, z + k*d) for k in (-1, 1) for j in (-1, 1) for i in (-1, 1)]
    for a, b, c, e in [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
                        (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]:
        face(material, v[a], v[b], v[c], v[e])


def cylinder(start, end, radius, material, segments=20):
    axis = unit(sub(end, start))
    basis = (0, 1, 0) if abs(axis[1]) < .95 else (1, 0, 0)
    u = unit(cross(axis, basis))
    v = cross(axis, u)
    rings = []
    for center in (start, end):
        rings.append([tuple(c + radius*(p*math.cos(a) + q*math.sin(a)) for c, p, q in zip(center, u, v))
                      for a in (2*math.pi*i/segments for i in range(segments))])
    first, second = rings
    for i in range(segments):
        j = (i + 1) % segments
        face(material, first[i], first[j], second[j], second[i])
        triangles[material].extend((start, first[j], first[i], end, second[i], second[j]))


def sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(vector):
    length = math.sqrt(sum(value*value for value in vector))
    return tuple(value/length for value in vector)


box((0, .49, -.01), (.46, .075, .45), 0)
box((0, .735, -.235), (.445, .42, .075), 0)
box((0, .31, -.075), (.37, .11, .32), 4)
box((0, .135, .42), (.39, .035, .19), 0)
for side in (-1, 1):
    x = .245*side
    cylinder((x, .22, -.27), (x, .41, .255), .022, 1)
    cylinder((x, .42, -.25), (x, .19, .30), .021, 1)
    cylinder((x, .36, -.245), (x, .98, -.27), .018, 1)
    cylinder((x, .43, -.14), (x, .655, -.14), .015, 1)
    cylinder((x, .20, .26), (x*.72, .14, .43), .017, 1)
    box((x, .66, -.005), (.076, .039, .32), 0)
    for y, z, radius, width in [(.167, -.245, .167, .075), (.087, .285, .087, .044)]:
        inner = (x + side*.006, y, z)
        outer = (x + side*width, y, z)
        cylinder(inner, outer, radius, 2, 36)
        cylinder(outer, (outer[0]+side*.008, y, z), radius*.70, 4, 28)
        cylinder((outer[0]+side*.008, y, z), (outer[0]+side*.014, y, z), radius*.28, 3, 20)
    cylinder((x, .98, -.27), (x, .98, -.36), .019, 3)
box((.245, .686, .188), (.084, .035, .095), 4)
cylinder((.245, .70, .19), (.245, .752, .19), .013, 0)
cylinder((-.235, .95, -.266), (.235, .95, -.266), .013, 1)

document = {"asset": {"version": "2.0", "generator": "Movility demo"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": []}], "materials": [], "bufferViews": [], "accessors": []}
binary = bytearray()


def attribute(values, bounds=False):
    index = len(document["accessors"])
    offset = len(binary)
    for value in values:
        binary.extend(struct.pack("<fff", *value))
    document["bufferViews"].append({"buffer": 0, "byteOffset": offset,
                                    "byteLength": len(binary)-offset, "target": 34962})
    accessor = {"bufferView": index, "componentType": 5126, "count": len(values), "type": "VEC3"}
    if bounds:
        accessor.update(min=[min(axis) for axis in zip(*values)], max=[max(axis) for axis in zip(*values)])
    document["accessors"].append(accessor)
    return index


for index, (name, color, metallic) in enumerate(materials):
    document["materials"].append({"name": name, "pbrMetallicRoughness": {
        "baseColorFactor": color, "metallicFactor": metallic, "roughnessFactor": .68}})
    vertices = triangles[index]
    normals = []
    for i in range(0, len(vertices), 3):
        a, b, c = vertices[i:i+3]
        normals.extend([unit(cross(sub(b, a), sub(c, a)))] * 3)
    document["meshes"][0]["primitives"].append({
        "attributes": {"POSITION": attribute(vertices, True), "NORMAL": attribute(normals)}, "material": index})

document["buffers"] = [{"byteLength": len(binary)}]
metadata = json.dumps(document, separators=(",", ":")).encode()
metadata += b" " * (-len(metadata) % 4)
target = Path(__file__).resolve().parent.parent / "assets" / "movility-one.glb"
target.write_bytes(struct.pack("<4sII", b"glTF", 2, 28 + len(metadata) + len(binary))
                   + struct.pack("<I4s", len(metadata), b"JSON") + metadata
                   + struct.pack("<I4s", len(binary), b"BIN\0") + binary)
