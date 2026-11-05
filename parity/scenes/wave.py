"""Wave Texture: band and ring directions, the three profiles, phase and distortion.

Object coordinates on the enlarged, offset plane (so values are negative too), Scale 1.5.
"""

from _common import by_id, emission_material, enlarge_and_offset

# variant: (type, direction, profile, {input: value})
SPECS = {
    "BANDS_X": ("BANDS", "X", "SIN", {}),
    "BANDS_Y_SAW": ("BANDS", "Y", "SAW", {}),
    "BANDS_DIAGONAL_TRI": ("BANDS", "DIAGONAL", "TRI", {}),
    "BANDS_PHASE": ("BANDS", "X", "SIN", {"Phase Offset": 1.7}),
    "RINGS_X": ("RINGS", "X", "SIN", {}),
    "RINGS_Z_TRI": ("RINGS", "Z", "TRI", {}),
    "RINGS_SPHERICAL_SAW": ("RINGS", "SPHERICAL", "SAW", {}),
    "DISTORTED": ("BANDS", "DIAGONAL", "SIN", {"Distortion": 4.0, "Detail": 3.5, "Detail Scale": 1.7}),
    "RINGS_DISTORTED": ("RINGS", "SPHERICAL", "TRI", {"Distortion": 2.0, "Detail Roughness": 0.7}),
}
VARIANTS = list(SPECS)


def setup(plane, variant):
    enlarge_and_offset(plane)


def build(variant):
    kind, direction, profile, values = SPECS[variant]
    mat, nodes, links, color_in = emission_material("wave")
    coord = nodes.new("ShaderNodeTexCoord")
    node = nodes.new("ShaderNodeTexWave")
    node.wave_type = kind
    if kind == "BANDS":
        node.bands_direction = direction
    else:
        node.rings_direction = direction
    node.wave_profile = profile
    inputs = by_id(node.inputs)
    inputs["Scale"].default_value = 1.5
    for name, value in values.items():
        inputs[name].default_value = value
    links.new(coord.outputs["Object"], inputs["Vector"])
    links.new(by_id(node.outputs)["Color"], color_in)
    return mat
