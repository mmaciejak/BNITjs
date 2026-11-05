"""Gabor Texture (Blender 4.3+): 2D and 3D, anisotropic and isotropic, all three outputs.

Unlinked Vector (Generated coordinates), Scale 4.
"""

from _common import by_id, emission_material

# variant: (type, {input: value}, output)
SPECS = {
    "2D": ("2D", {}, "Value"),
    "2D_ISOTROPIC": ("2D", {"Anisotropy": 0.3, "Frequency": 3.0}, "Value"),
    "2D_ORIENTED": ("2D", {"Orientation 2D": 1.2, "Frequency": 1.5}, "Value"),
    "2D_PHASE": ("2D", {"Anisotropy": 0.6}, "Phase"),
    "2D_INTENSITY": ("2D", {"Anisotropy": 0.6}, "Intensity"),
    "3D": ("3D", {}, "Value"),
    "3D_ISOTROPIC": ("3D", {"Anisotropy": 0.2, "Orientation 3D": (0.3, 0.8, 0.5)}, "Value"),
    "3D_INTENSITY": ("3D", {"Anisotropy": 0.5}, "Intensity"),
}
VARIANTS = list(SPECS)


def build(variant):
    kind, values, output = SPECS[variant]
    mat, nodes, links, color_in = emission_material("gabor")
    node = nodes.new("ShaderNodeTexGabor")
    node.gabor_type = kind
    inputs = by_id(node.inputs)
    inputs["Scale"].default_value = 4.0
    for name, value in values.items():
        inputs[name].default_value = value
    links.new(by_id(node.outputs)[output], color_in)
    return mat
