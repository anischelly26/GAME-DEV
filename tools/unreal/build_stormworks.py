"""
Builds The Stormworks Escape (/Game/ItTakesOne/Maps/Stormworks) in an Unreal Engine 5 project that
has the ItTakesOne C++ module (unreal/Source) and the Third Person template. Headless:

    UnrealEditor-Cmd.exe <Project>.uproject -run=pythonscript -script="<repo>/tools/unreal/build_stormworks.py" -nullrhi -unattended

It imports the synthesised sounds (make_stormworks_sounds.py writes them to ../Import/Stormworks/Audio)
and seven CC0 Poly Haven surface sets from the web game (public/assets/textures), makes the materials
(a triplanar textured master, a plain surface master, a translucent master and their instances),
then lays out the sequence and saves it. Rebuilding replaces the map and the assets.

Coordinates below are metres in Unreal's frame: X north (toward the lighthouse), Y east, Z up.

  Beat 1  Ivo's workshop (x -8..0): the north window frames the lighthouse burning out at sea.
  Beat 2  The tether on the workbench; a cargo crate blocks the corridor door; pull it aside.
  Beat 3  The seawall gallery (y 10..13) is broken at x 14..25. The far anchor is out of reach from
          the edge; pull the crate on the girder to the near edge, stand on it, tether across.
  Beat 4  The storm coupling (x 30.5): engaging it starts the storm engine; the sluice gate opens,
          alarms, and the old catwalk beyond is armed.
  Beat 5  The catwalk (x 34.6..73.6) collapses behind her: a tether, a jump, a tether up to the
          signal tower's roof.
  Beat 6  The tower roof (x 83..92, z 4): a checkpoint, the lighthouse ahead, and Ivo's note in his
          hut.
"""
import math
import os
import time
import traceback

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
TEXTURES_SRC = os.path.join(REPO, "public", "assets", "textures")
PROJECT_DIR = os.path.abspath(unreal.Paths.project_dir())
AUDIO_SRC = os.path.abspath(os.path.join(PROJECT_DIR, os.pardir, "Import", "Stormworks", "Audio"))
LOG = os.path.join(PROJECT_DIR, "Saved", "Stormworks_build.log")

ROOT = "/Game/ItTakesOne/Stormworks"
MAP = "/Game/ItTakesOne/Maps/Stormworks"
TEMPLATE = "/Engine/Maps/Templates/Template_Default"

AT = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary
MP = unreal.MaterialProperty


def log(msg):
    line = "[Stormworks] %s %s" % (time.strftime("%H:%M:%S"), msg)
    unreal.log(line)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def V(x, y, z):
    return unreal.Vector(x * 100.0, y * 100.0, z * 100.0)


def R(pitch=0.0, yaw=0.0, roll=0.0):
    """Unreal's Python Rotator takes (roll, pitch, yaw) positionally: always use keywords."""
    return unreal.Rotator(roll=roll, pitch=pitch, yaw=yaw)


def C(r, g, b):
    return unreal.Color(r=int(r), g=int(g), b=int(b), a=255)


def setp(obj, value, *names):
    """Set the first property name that exists (bool properties lose their b prefix in Python)."""
    for n in names:
        try:
            obj.set_editor_property(n, value)
            return
        except Exception:
            pass
    log("WARNING no property %s on %s" % ("/".join(names), obj.get_name()))


def fresh(path):
    if EAL.does_asset_exist(path):
        EAL.delete_asset(path)


# ------------------------------------------------------------------------------------------------
# Assets


def import_file(src, dest_dir, name):
    fresh("%s/%s" % (dest_dir, name))
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", src)
    task.set_editor_property("destination_path", dest_dir)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", False)
    AT.import_asset_tasks([task])
    unreal.InterchangeManager.get_interchange_manager_scripted().wait_until_all_tasks_done(False)
    asset = unreal.load_asset("%s/%s" % (dest_dir, name))
    if asset is None:
        log("WARNING import failed: %s" % src)
    return asset


def import_sounds():
    names = sorted(f[:-4] for f in os.listdir(AUDIO_SRC) if f.endswith(".wav"))
    for n in names:
        s = import_file(os.path.join(AUDIO_SRC, n + ".wav"), ROOT + "/Audio", n)
        if s and n in ("S_TOS_Wind", "S_TOS_Alarm"):
            s.set_editor_property("looping", True)
    log("sounds: %d" % len(names))


# Recorded sounds: Kenney's CC0 packs (see docs/ASSETS.md). The web game's selection in
# public/assets/audio/sfx is in the repository; the rest comes from the packs as downloaded into
# the git-ignored import-cache/audio/kenney (node scripts/build-audio.mjs fetches them).
SFX_DIR = os.path.join(REPO, "public", "assets", "audio", "sfx")
KENNEY_DIR = os.path.join(REPO, "import-cache", "audio", "kenney")
RECORDED = []
for _i in range(5):
    RECORDED += [
        ("SFX_Step_Stone_%d" % _i, SFX_DIR, "impact-sounds-footstep_concrete_%03d.ogg" % _i),
        ("SFX_Step_Wood_%d" % _i, SFX_DIR, "impact-sounds-footstep_wood_%03d.ogg" % _i),
        ("SFX_Step_Metal_%d" % _i, SFX_DIR, "impact-sounds-impactPlate_light_%03d.ogg" % _i),
        ("SFX_Land_%d" % _i, SFX_DIR, "impact-sounds-impactSoft_medium_%03d.ogg" % _i),
        ("SFX_LandHeavy_%d" % _i, SFX_DIR, "impact-sounds-impactSoft_heavy_%03d.ogg" % _i),
        ("SFX_MetalLight_%d" % _i, SFX_DIR, "impact-sounds-impactMetal_light_%03d.ogg" % _i),
        ("SFX_MetalHeavy_%d" % _i, SFX_DIR, "impact-sounds-impactMetal_heavy_%03d.ogg" % _i),
        ("SFX_Bell_%d" % _i, os.path.join(KENNEY_DIR, "impact-sounds", "Audio"), "impactBell_heavy_%03d.ogg" % _i),
        ("SFX_Tin_%d" % _i, os.path.join(KENNEY_DIR, "impact-sounds", "Audio"), "impactTin_medium_%03d.ogg" % _i),
        ("SFX_Glass_%d" % _i, os.path.join(KENNEY_DIR, "impact-sounds", "Audio"), "impactGlass_light_%03d.ogg" % _i),
    ]
RECORDED += [
    ("SFX_Click", SFX_DIR, "rpg-audio-metalClick.ogg"),
    ("SFX_Latch", SFX_DIR, "rpg-audio-metalLatch.ogg"),
] + [("SFX_Creak_%d" % i, SFX_DIR, "rpg-audio-creak%d.ogg" % (i + 1)) for i in range(3)] + [
    ("SFX_Cloth_%d" % i, SFX_DIR, "rpg-audio-cloth%d.ogg" % (i + 1)) for i in range(4)] + [
    ("SFX_PageFlip_%d" % i, os.path.join(KENNEY_DIR, "rpg-audio", "Audio"), "bookFlip%d.ogg" % (i + 1)) for i in range(3)] + [
    ("SFX_BookOpen", os.path.join(KENNEY_DIR, "rpg-audio", "Audio"), "bookOpen.ogg"),
    ("SFX_BookClose", os.path.join(KENNEY_DIR, "rpg-audio", "Audio"), "bookClose.ogg"),
]


def import_recorded_sounds():
    done, missing = 0, []
    for name, folder, fname in RECORDED:
        src = os.path.join(folder, fname)
        if not os.path.exists(src):
            missing.append(fname)
            continue
        if import_file(src, ROOT + "/Audio", name):
            done += 1
    log("recorded sounds: %d imported, %d missing%s" % (done, len(missing), (" (" + ", ".join(missing[:6]) + ")") if missing else ""))


SETS = {
    # name: (Poly Haven id, tile size in metres)
    "stone": ("castle_wall_slates", 2.5),
    "stoneDark": ("old_stone_wall", 2.0),
    "floor": ("cobblestone_floor_04", 1.5),
    "metal": ("metal_plate", 2.0),
    "wood": ("old_planks_02", 2.0),
    "rock": ("dark_rock", 3.0),
    "grate": ("metal_grate_rusty", 1.5),
}


def import_textures():
    tex = {}
    for key, (pid, _tile) in SETS.items():
        for part in ("diff", "nor", "arm"):
            src = os.path.join(TEXTURES_SRC, pid, part + ".jpg")
            t = import_file(src, ROOT + "/Textures", "T_%s_%s" % (pid, part))
            if t is None:
                continue
            if part == "nor":
                t.set_editor_property("srgb", False)
                t.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
            elif part == "arm":
                t.set_editor_property("srgb", False)
                t.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_MASKS)
            tex[(key, part)] = t
    log("textures: %d" % len(tex))
    return tex


def node(mat, cls, x, y):
    return MEL.create_material_expression(mat, cls, x, y)


def link(a, a_out, b, b_in):
    if not MEL.connect_material_expressions(a, a_out, b, b_in):
        log("WARNING could not connect %s.%s -> %s.%s" % (a.get_name(), a_out, b.get_name(), b_in))


def prop(a, a_out, p):
    if not MEL.connect_material_property(a, a_out, p):
        log("WARNING could not connect %s.%s -> %s" % (a.get_name(), a_out, p))


def vparam(mat, name, value, x, y):
    e = node(mat, unreal.MaterialExpressionVectorParameter, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", unreal.LinearColor(*value))
    return e


def sparam(mat, name, value, x, y):
    e = node(mat, unreal.MaterialExpressionScalarParameter, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", value)
    return e


def mask(mat, src, out, channels, x, y):
    e = node(mat, unreal.MaterialExpressionComponentMask, x, y)
    for c in "rgba":
        e.set_editor_property(c, c in channels)
    link(src, out, e, "")
    return e


def binop(mat, cls, a, a_out, b, b_out, x, y):
    e = node(mat, cls, x, y)
    link(a, a_out, e, "A")
    link(b, b_out, e, "B")
    return e


def new_material(name):
    fresh("%s/Materials/%s" % (ROOT, name))
    return AT.create_asset(name, ROOT + "/Materials", unreal.Material, unreal.MaterialFactoryNew())


def make_surface_master():
    """Plain PBR surface with emissive (brass, painted iron, glows, the sea, paper)."""
    m = new_material("M_TOS_Surface")
    prop(vparam(m, "BaseColor", (0.5, 0.5, 0.5, 1), -600, -200), "", MP.MP_BASE_COLOR)
    prop(sparam(m, "Roughness", 0.6, -600, 0), "", MP.MP_ROUGHNESS)
    prop(sparam(m, "Metallic", 0.0, -600, 100), "", MP.MP_METALLIC)
    em = binop(m, unreal.MaterialExpressionMultiply, vparam(m, "EmissiveColor", (0, 0, 0, 1), -800, 250), "", sparam(m, "EmissiveStrength", 0.0, -800, 450), "", -500, 300)
    prop(em, "", MP.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m)
    return m


def make_textured_master():
    """
    Triplanar (world-aligned) PBR from three textures (albedo, normal, AO/roughness/metal packed),
    so stretched cubes of any size keep a true texel size. TileSize is the texture's width in cm.
    """
    m = new_material("M_TOS_Textured")
    wp = node(m, unreal.MaterialExpressionWorldPosition, -2200, 0)
    tile = sparam(m, "TileSize", 250.0, -2200, 200)
    uv = {}
    for axis, ch, y in (("x", "gb", -300), ("y", "rb", 0), ("z", "rg", 300)):
        msk = mask(m, wp, "", ch, -2000, y)
        uv[axis] = binop(m, unreal.MaterialExpressionDivide, msk, "", tile, "", -1800, y)
    # Blend weights from the surface normal: |n|^4, normalised.
    n = node(m, unreal.MaterialExpressionVertexNormalWS, -2200, 600)
    ab = node(m, unreal.MaterialExpressionAbs, -2000, 600)
    link(n, "", ab, "")
    n2 = binop(m, unreal.MaterialExpressionMultiply, ab, "", ab, "", -1850, 600)
    n4 = binop(m, unreal.MaterialExpressionMultiply, n2, "", n2, "", -1700, 600)
    one = node(m, unreal.MaterialExpressionConstant3Vector, -1850, 750)
    one.set_editor_property("constant", unreal.LinearColor(1, 1, 1, 1))
    total = binop(m, unreal.MaterialExpressionDotProduct, n4, "", one, "", -1550, 700)
    w = binop(m, unreal.MaterialExpressionDivide, n4, "", total, "", -1400, 650)
    wts = {"x": mask(m, w, "", "r", -1250, 550), "y": mask(m, w, "", "g", -1250, 650), "z": mask(m, w, "", "b", -1250, 750)}

    def tri(param, sampler, default, y0):
        acc = None
        for k, axis in enumerate(("x", "y", "z")):
            s = node(m, unreal.MaterialExpressionTextureSampleParameter2D, -1500, y0 + k * 220)
            s.set_editor_property("parameter_name", param)
            if default:
                s.set_editor_property("texture", default)
            s.set_editor_property("sampler_type", sampler)
            link(uv[axis], "", s, "UVs")
            part = binop(m, unreal.MaterialExpressionMultiply, s, "RGB", wts[axis], "", -1200, y0 + k * 220)
            acc = part if acc is None else binop(m, unreal.MaterialExpressionAdd, acc, "", part, "", -1050, y0 + k * 220)
        return acc

    return m, tri


def finish_textured_master(m, tri, tex):
    albedo = tri("Albedo", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, tex.get(("stone", "diff")), -1600)
    normal = tri("Normal", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL, tex.get(("stone", "nor")), -900)
    arm = tri("ARM", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS, tex.get(("stone", "arm")), -200)
    tint = vparam(m, "Tint", (1, 1, 1, 1), -900, -1800)
    prop(binop(m, unreal.MaterialExpressionMultiply, albedo, "", tint, "", -700, -1600), "", MP.MP_BASE_COLOR)
    flat = node(m, unreal.MaterialExpressionConstant3Vector, -900, -700)
    flat.set_editor_property("constant", unreal.LinearColor(0, 0, 1, 1))
    lerp = node(m, unreal.MaterialExpressionLinearInterpolate, -700, -900)
    link(flat, "", lerp, "A")
    link(normal, "", lerp, "B")
    link(sparam(m, "NormalStrength", 0.8, -900, -600), "", lerp, "Alpha")
    prop(lerp, "", MP.MP_NORMAL)
    prop(mask(m, arm, "", "r", -800, -200), "", MP.MP_AMBIENT_OCCLUSION)
    prop(binop(m, unreal.MaterialExpressionMultiply, mask(m, arm, "", "g", -800, -100), "", sparam(m, "RoughnessScale", 1.0, -800, 0), "", -650, -100), "", MP.MP_ROUGHNESS)
    prop(binop(m, unreal.MaterialExpressionMultiply, mask(m, arm, "", "b", -800, 100), "", sparam(m, "MetallicScale", 1.0, -800, 200), "", -650, 100), "", MP.MP_METALLIC)
    MEL.recompile_material(m)


def make_translucent_master():
    m = new_material("M_TOS_Translucent")
    m.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    prop(vparam(m, "Color", (0.7, 0.75, 0.8, 1), -500, 0), "", MP.MP_EMISSIVE_COLOR)
    prop(sparam(m, "Opacity", 0.25, -500, 200), "", MP.MP_OPACITY)
    # The rain is an instanced mesh: without this flag the game falls back to the default material.
    m.set_editor_property("used_with_instanced_static_meshes", True)
    MEL.recompile_material(m)
    return m


def mi(name, parent, vectors=None, scalars=None, textures=None):
    path = "%s/Materials/%s" % (ROOT, name)
    fresh(path)
    inst = AT.create_asset(name, ROOT + "/Materials", unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(inst, parent)
    for k, v in (vectors or {}).items():
        MEL.set_material_instance_vector_parameter_value(inst, k, unreal.LinearColor(*v))
    for k, v in (scalars or {}).items():
        MEL.set_material_instance_scalar_parameter_value(inst, k, v)
    for k, v in (textures or {}).items():
        if v:
            MEL.set_material_instance_texture_parameter_value(inst, k, v)
    return inst


def make_materials(tex):
    surf = make_surface_master()
    textured, tri = make_textured_master()
    finish_textured_master(textured, tri, tex)
    trans = make_translucent_master()
    M = {}

    def textured_mi(name, key, tint=(1, 1, 1, 1), rough=1.0, metal=1.0, normal=0.8):
        M[name] = mi(name, textured, {"Tint": tint}, {"TileSize": SETS[key][1] * 100.0, "RoughnessScale": rough, "MetallicScale": metal, "NormalStrength": normal},
                     {"Albedo": tex.get((key, "diff")), "Normal": tex.get((key, "nor")), "ARM": tex.get((key, "arm"))})

    textured_mi("MI_TOS_Stone", "stone", (0.62, 0.66, 0.72, 1))
    textured_mi("MI_TOS_StoneDark", "stoneDark", (0.45, 0.5, 0.56, 1))
    textured_mi("MI_TOS_Floor", "floor", (0.7, 0.72, 0.76, 1))
    textured_mi("MI_TOS_Rock", "rock", (0.55, 0.6, 0.65, 1))
    textured_mi("MI_TOS_Wood", "wood", (0.8, 0.7, 0.6, 1))
    textured_mi("MI_TOS_Crate", "wood", (0.72, 0.52, 0.32, 1), 1.0, 0.0)
    textured_mi("MI_TOS_Iron", "metal", (0.35, 0.38, 0.42, 1), 1.1, 0.7)
    textured_mi("MI_TOS_Grate", "grate", (0.6, 0.6, 0.62, 1), 1.0, 0.8)

    def surf_mi(name, base, rough, metal, emissive=(0, 0, 0, 1), strength=0.0):
        M[name] = mi(name, surf, {"BaseColor": base, "EmissiveColor": emissive}, {"Roughness": rough, "Metallic": metal, "EmissiveStrength": strength})

    teal = (0.1, 0.85, 0.75, 1)
    surf_mi("MI_TOS_Brass", (0.75, 0.52, 0.2, 1), 0.3, 1.0)
    surf_mi("MI_TOS_TetherGlow", (0.05, 0.4, 0.35, 1), 0.3, 0.0, teal, 6.0)
    surf_mi("MI_TOS_Cable", (0.05, 0.055, 0.06, 1), 0.35, 0.8, teal, 0.35)
    surf_mi("MI_TOS_Paper", (0.85, 0.79, 0.66, 1), 0.9, 0.0)
    surf_mi("MI_TOS_LampGlow", (1, 0.8, 0.5, 1), 0.5, 0.0, (1, 0.72, 0.42, 1), 40.0)
    surf_mi("MI_TOS_WindowGlow", (1, 0.7, 0.4, 1), 0.5, 0.0, (1, 0.62, 0.3, 1), 6.0)
    surf_mi("MI_TOS_WarningRed", (0.5, 0.05, 0.03, 1), 0.4, 0.0, (1, 0.08, 0.04, 1), 3.0)
    # Old painted iron, weathered: it should read as "machinery, careful" without shouting.
    surf_mi("MI_TOS_Hazard", (0.42, 0.27, 0.06, 1), 0.62, 0.3)
    surf_mi("MI_TOS_Sea", (0.01, 0.025, 0.035, 1), 0.06, 0.0)
    surf_mi("MI_TOS_Cloth", (0.32, 0.2, 0.16, 1), 0.95, 0.0)
    # The prisoners' washing: faded linen, coral, sea blue and ochre (none of them the tether's teal).
    for i, c in enumerate(((0.72, 0.69, 0.62, 1), (0.56, 0.24, 0.19, 1), (0.24, 0.33, 0.46, 1), (0.58, 0.44, 0.2, 1))):
        surf_mi("MI_TOS_Laundry_%d" % i, c, 0.95, 0.0)
    surf_mi("MI_TOS_ToyRed", (0.55, 0.08, 0.05, 1), 0.45, 0.2)
    M["MI_TOS_Rain"] = mi("MI_TOS_Rain", trans, {"Color": (0.55, 0.62, 0.7, 1)}, {"Opacity": 0.22})
    log("materials: %d instances" % len(M))
    return M


# ------------------------------------------------------------------------------------------------
# The level


class Builder:
    def __init__(self, M):
        self.M = M
        self.eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        self.cube = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
        self.cylinder = unreal.load_asset("/Engine/BasicShapes/Cylinder.Cylinder")
        self.sphere = unreal.load_asset("/Engine/BasicShapes/Sphere.Sphere")
        self.plane = unreal.load_asset("/Engine/BasicShapes/Plane.Plane")
        self.count = 0

    def spawn(self, cls, loc, rot=(0, 0, 0), label=None, folder=None):
        a = self.eas.spawn_actor_from_class(cls, loc, R(*rot))
        if label:
            a.set_actor_label(label)
        if folder:
            a.set_folder_path(folder)
        self.count += 1
        return a

    def mesh(self, mesh, loc, scale, mat, label, folder, rot=(0, 0, 0), collide=True):
        # By class, then the mesh: headless, there are no actor factories to spawn from an asset.
        a = self.eas.spawn_actor_from_class(unreal.StaticMeshActor, loc, R(*rot))
        a.set_actor_scale3d(scale)
        comp = a.static_mesh_component
        comp.set_static_mesh(mesh)
        comp.set_material(0, self.M[mat])
        if not collide:
            comp.set_collision_profile_name("NoCollision")
        a.set_actor_label(label)
        a.set_folder_path(folder)
        self.count += 1
        return a

    def box(self, label, x0, x1, y0, y1, z0, z1, mat, folder="Geometry", collide=True):
        return self.mesh(self.cube, V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), unreal.Vector(x1 - x0, y1 - y0, z1 - z0), mat, label, folder, collide=collide)

    def column(self, label, x, y, z0, z1, radius, mat, folder="Geometry"):
        return self.mesh(self.cylinder, V(x, y, (z0 + z1) / 2), unreal.Vector(radius * 2, radius * 2, z1 - z0), mat, label, folder)

    def light(self, label, x, y, z, color, intensity, radius, folder="Lights", shadows=False):
        a = self.spawn(unreal.PointLight, V(x, y, z), label=label, folder=folder)
        c = a.get_component_by_class(unreal.PointLightComponent)
        c.set_editor_property("intensity_units", unreal.LightUnits.UNITLESS)
        c.set_editor_property("intensity", intensity)
        c.set_editor_property("light_color", C(color[0] * 255, color[1] * 255, color[2] * 255))
        c.set_editor_property("attenuation_radius", radius * 100.0)
        c.set_editor_property("cast_shadows", shadows)
        return a

    def lamp(self, label, x, y, z, intensity=5000.0, radius=9.0, shadows=False):
        """A warm work lamp: a glowing bulb in a little cage, and its light."""
        self.mesh(self.sphere, V(x, y, z), unreal.Vector(0.16, 0.16, 0.2), "MI_TOS_LampGlow", label + "_Bulb", "Lights", collide=False)
        return self.light(label, x, y, z - 0.2, (1.0, 0.7, 0.42), intensity, radius, shadows=shadows)

    def text(self, label, s, x, y, z, yaw, size=30.0, color=(235, 232, 220)):
        a = self.spawn(unreal.TextRenderActor, V(x, y, z), (0, yaw, 0), label, "Story")
        t = a.text_render
        t.set_editor_property("text", s)
        t.set_editor_property("world_size", size)
        t.set_editor_property("text_render_color", C(*color))
        t.set_editor_property("horizontal_alignment", unreal.HorizTextAligment.EHTA_CENTER)
        return a

    def waypoint(self, tag, x, y, z=0.0):
        a = self.spawn(unreal.TargetPoint, V(x, y, z + 0.1), label=tag, folder="Test/Waypoints")
        a.set_editor_property("tags", [unreal.Name(tag)])
        return a

    def ring(self, tag, kind, x, y, z, yaw, landing=None, movable=None):
        a = self.spawn(unreal.TetherPoint, V(x, y, z), (0, yaw, 0), tag, "Tether")
        a.set_editor_property("kind", kind)
        a.set_editor_property("tags", [unreal.Name(tag)])
        if landing:
            t = unreal.Transform(V(x, y, z), R(yaw=yaw), unreal.Vector(1, 1, 1))
            a.set_editor_property("landing_offset", t.inverse_transform_location(V(*landing)))
        if movable:
            a.set_editor_property("movable", movable)
        return a

    def movable(self, tag, x, y, z, size, track_end, mat="MI_TOS_Crate", speed=280.0, one_way=False, rail=True, rail_drop=None, sound="S_TOS_Grind"):
        a = self.spawn(unreal.TetherMovable, V(x, y, z), label=tag, folder="Tether")
        a.set_editor_property("tags", [unreal.Name(tag)])
        a.set_editor_property("body_size", V(*size))
        a.set_editor_property("track_end", V(*track_end))
        a.set_editor_property("speed", speed)
        setp(a, one_way, "one_way", "b_one_way")
        setp(a, rail, "show_rail", "b_show_rail")
        a.set_editor_property("body_material", unreal.Name(mat))
        a.set_editor_property("move_sound", unreal.Name(sound))
        if rail_drop is not None:
            a.set_editor_property("rail_drop", rail_drop * 100.0)
        return a

    def checkpoint(self, order, label, x, y, z, yaw, objective, extent=(1.5, 2.0, 1.5)):
        a = self.spawn(unreal.StormCheckpoint, V(x, y, z + 1.0), (0, yaw, 0), "Checkpoint_%d_%s" % (order, label), "Checkpoints")
        a.set_editor_property("order", order)
        a.set_editor_property("label", label)
        a.set_editor_property("objective", objective)
        a.set_editor_property("extent", V(*extent))
        return a


def setup_atmosphere(b):
    """Storm light: a cold, dim key from high in the south-east, dense blue fog, fixed exposure."""
    key = None
    for a in b.eas.get_all_level_actors():
        cls = a.get_class().get_name()
        if isinstance(a, unreal.DirectionalLight):
            key = a
            c = a.get_component_by_class(unreal.DirectionalLightComponent)
            # A dim, cold key low in the sky: storm dusk, not day.
            c.set_editor_property("intensity", 0.9)
            c.set_editor_property("light_color", C(150, 180, 235))
            a.set_actor_rotation(R(pitch=-9, yaw=140), False)
            a.set_actor_label("StormLight")
        elif isinstance(a, unreal.SkyLight):
            a.get_component_by_class(unreal.SkyLightComponent).set_editor_property("intensity", 1.0)
        elif isinstance(a, unreal.ExponentialHeightFog):
            f = a.get_component_by_class(unreal.ExponentialHeightFogComponent)
            for k, v in (("fog_density", 0.035), ("fog_height_falloff", 0.05), ("enable_volumetric_fog", True),
                         ("volumetric_fog_scattering_distribution", 0.55), ("start_distance", 600.0)):
                try:
                    f.set_editor_property(k, v)
                except Exception as e:
                    log("fog %s: %s" % (k, e))
            for k in ("fog_inscattering_luminance", "fog_inscattering_color"):
                try:
                    f.set_editor_property(k, unreal.LinearColor(0.03, 0.045, 0.06, 1))
                    break
                except Exception:
                    pass
            a.set_actor_location(V(0, 0, -12), False, False)
        elif cls == "VolumetricCloud":
            # The fog carries the storm; clouds cost a lot on a laptop GPU.
            b.eas.destroy_actor(a)
    pp = b.spawn(unreal.PostProcessVolume, V(0, 0, 0), label="StormGrade", folder="Lighting")
    pp.set_editor_property("unbound", True)
    s = pp.get_editor_property("settings")
    for k, v in (("override_auto_exposure_method", True), ("auto_exposure_method", unreal.AutoExposureMethod.AEM_HISTOGRAM),
                 ("override_auto_exposure_apply_physical_camera_exposure", True), ("auto_exposure_apply_physical_camera_exposure", False),
                 ("override_auto_exposure_min_brightness", True), ("auto_exposure_min_brightness", -1.5),
                 ("override_auto_exposure_max_brightness", True), ("auto_exposure_max_brightness", 1.0),
                 ("override_auto_exposure_bias", True), ("auto_exposure_bias", 0.5),
                 ("override_vignette_intensity", True), ("vignette_intensity", 0.45),
                 ("override_bloom_intensity", True), ("bloom_intensity", 0.9)):
        try:
            s.set_editor_property(k, v)
        except Exception as e:
            log("post %s: %s" % (k, e))
    pp.set_editor_property("settings", s)
    return key


def build_level(M):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if EAL.does_asset_exist(MAP):
        EAL.delete_asset(MAP)
    if not les.new_level_from_template(MAP, TEMPLATE):
        raise RuntimeError("could not create " + MAP)
    b = Builder(M)
    for a in b.eas.get_all_level_actors():
        if isinstance(a, unreal.StaticMeshActor) and "floor" in a.get_actor_label().lower():
            b.eas.destroy_actor(a)
        elif isinstance(a, unreal.PlayerStart):
            b.eas.destroy_actor(a)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    world.get_world_settings().set_editor_property("default_game_mode", unreal.StormworksGameMode)
    key = setup_atmosphere(b)

    # ---------------------------------------------------------------- the sea and the far coast
    b.box("Sea", -620, 780, -680, 720, -12.1, -12.0, "MI_TOS_Sea", "World", collide=False)
    for i, (x, y, s) in enumerate(((18, 18, 3), (21, 15, 2.2), (57, 16, 2.6), (75, 17, 3.2), (78, 6, 2.4), (44, 15.5, 1.8))):
        b.box("SeaRock_%d" % i, x - s / 2, x + s / 2, y - s / 2, y + s / 2, -12.5, -11.2 + s * 0.3, "MI_TOS_Rock", "World")

    # ---------------------------------------------------------------- the prison behind (silhouette)
    b.box("Prison_Main", -60, -8.4, -40, 9.4, -12, 26, "MI_TOS_StoneDark", "Prison")
    b.box("Prison_Tower", -20, -10, -2, 8, 26, 38, "MI_TOS_StoneDark", "Prison")
    b.box("Prison_Wing", -40, -8.4, -60, -40, -12, 18, "MI_TOS_StoneDark", "Prison")
    for i in range(8):
        # Lit cells on the north face: someone is always awake in Breakwater.
        b.box("Prison_Window_%d" % i, -8.45, -8.35, -36 + i * 5.3, -35.4 + i * 5.3, 9 + (i % 3) * 4, 10.2 + (i % 3) * 4, "MI_TOS_WindowGlow", "Prison", collide=False)

    # ---------------------------------------------------------------- Beat 1-2: Ivo's workshop
    F = "Workshop"
    b.box("Workshop_Base", -8.4, 0.4, -4.4, 9.4, -12, 0, "MI_TOS_StoneDark", F)
    b.box("Workshop_Floor", -8.0, 0.0, -4.0, 4.0, -0.05, 0.0, "MI_TOS_Wood", F)
    b.box("Workshop_WallW", -8.4, -8.0, -4.4, 4.4, 0, 4, "MI_TOS_Stone", F)
    b.box("Workshop_WallS", -8.4, 0.4, -4.4, -4.0, 0, 4, "MI_TOS_Stone", F)
    # North wall with the window toward the lighthouse.
    b.box("Workshop_WallN_a", 0.0, 0.4, -4.4, -2.2, 0, 4, "MI_TOS_Stone", F)
    b.box("Workshop_WallN_b", 0.0, 0.4, 2.2, 4.4, 0, 4, "MI_TOS_Stone", F)
    b.box("Workshop_WallN_sill", 0.0, 0.4, -2.2, 2.2, 0, 0.8, "MI_TOS_Stone", F)
    b.box("Workshop_WallN_head", 0.0, 0.4, -2.2, 2.2, 3.2, 4, "MI_TOS_Stone", F)
    for i, y in enumerate((-1.1, 0.0, 1.1)):
        b.box("Workshop_WindowBar_%d" % i, 0.15, 0.25, y - 0.03, y + 0.03, 0.8, 3.2, "MI_TOS_Iron", F)
    # East wall with the door to the corridor.
    b.box("Workshop_WallE_a", -8.4, -4.5, 4.0, 4.4, 0, 4, "MI_TOS_Stone", F)
    b.box("Workshop_WallE_b", -2.5, 0.4, 4.0, 4.4, 0, 4, "MI_TOS_Stone", F)
    b.box("Workshop_WallE_head", -4.5, -2.5, 4.0, 4.4, 2.6, 4, "MI_TOS_Stone", F)
    b.box("Workshop_Ceiling", -8.4, 0.4, -4.4, 4.4, 4, 4.4, "MI_TOS_StoneDark", F)
    # Ivo's bench, his cot, his things.
    b.box("Workshop_Bench", -6.8, -4.2, -3.9, -2.9, 0, 0.92, "MI_TOS_Wood", F)
    b.box("Workshop_BenchVice", -4.8, -4.5, -3.6, -3.2, 0.92, 1.12, "MI_TOS_Iron", F)
    b.box("Workshop_Cot", -7.9, -6.0, 1.9, 3.0, 0, 0.45, "MI_TOS_Wood", F)
    b.box("Workshop_CotBlanket", -7.8, -6.1, 2.0, 2.9, 0.45, 0.55, "MI_TOS_Cloth", F)
    b.box("Workshop_Crate", -1.4, -0.4, -3.8, -2.8, 0, 0.8, "MI_TOS_Crate", F)
    b.mesh(b.cylinder, V(-6.1, -3.4, 1.0), unreal.Vector(0.09, 0.09, 0.14), "MI_TOS_Iron", "Workshop_Mug", F)
    # The tally of days, and someone else's: Ivo's mark.
    b.text("Workshop_Tally", "IIII IIII IIII IIII IIII II", -7.98, 0.0, 2.0, 0, 26)
    b.text("Workshop_IvoMark", "IV", -7.98, -2.5, 2.6, 0, 40)
    b.lamp("Workshop_Lamp_Bench", -5.5, -3.3, 2.4, 6000, 7, shadows=True)
    b.lamp("Workshop_Lamp_Door", -3.5, 3.4, 3.2, 3500, 6)
    # Ivo's wind-up tin boat at the end of his bench (E winds it).
    b.spawn(unreal.WorkshopToy, V(-6.6, -3.15, 0.92), label="Ivo_Toy", folder="Story")
    pick = b.spawn(unreal.TetherPickup, V(-5.4, -3.4, 1.1), label="TetherPickup", folder="Tether")
    pick.set_editor_property("objective", "Pull the crate off the door")

    # ---------------------------------------------------------------- the corridor and the door crate
    F = "Corridor"
    b.box("Corridor_Floor", -4.9, -0.1, 4.0, 9.4, -0.05, 0.0, "MI_TOS_Floor", F)
    b.box("Corridor_WallS", -4.9, -4.5, 4.4, 9.4, 0, 3.0, "MI_TOS_Stone", F)
    b.box("Corridor_WallN_a", -2.5, -2.1, 6.4, 9.4, 0, 3.0, "MI_TOS_Stone", F)
    b.box("Corridor_Alcove_E", -0.3, 0.1, 4.4, 6.4, 0, 3.0, "MI_TOS_Stone", F)
    b.box("Corridor_Alcove_N", -2.5, 0.1, 6.4, 6.8, 0, 3.0, "MI_TOS_Stone", F)
    b.box("Corridor_Ceiling", -4.9, 0.1, 4.0, 9.4, 3.0, 3.3, "MI_TOS_StoneDark", F)
    b.lamp("Corridor_Lamp", -3.5, 8.6, 2.6, 3000, 6)
    door = b.movable("Crate_Door", -3.5, 5.4, 0.9, (1.8, 1.6, 1.8), (2.2, 0, 0), speed=300.0, rail_drop=0.9)
    b.ring("Ring_Door", unreal.TetherPointKind.PULL, -3.5, 4.55, 1.35, -90, movable=door)

    # ---------------------------------------------------------------- Beat 3: the seawall gallery
    F = "Gallery"
    b.box("Breakwater_Wall_a", -8.4, -4.5, 9.4, 10.0, -12, 6, "MI_TOS_Stone", F)
    b.box("Breakwater_Wall_b", -2.5, 34.0, 9.4, 10.0, -12, 6, "MI_TOS_Stone", F)
    b.box("Breakwater_Wall_door", -4.5, -2.5, 9.4, 10.0, 2.8, 6, "MI_TOS_Stone", F)
    b.box("Corridor_WallS_out", -4.9, -4.5, 9.4, 10.0, 0, 2.8, "MI_TOS_Stone", F)
    b.box("Breakwater_DoorSill", -4.5, -2.5, 9.4, 10.0, -12, 0, "MI_TOS_Floor", F)
    b.box("Gallery_Near", -6.0, 14.0, 10.0, 13.0, -12, 0, "MI_TOS_Floor", F)
    b.box("Gallery_NearEnd", -6.4, -6.0, 10.0, 13.0, 0, 3, "MI_TOS_Stone", F)
    b.box("Gallery_Far", 25.0, 34.0, 10.0, 13.0, -12, 0, "MI_TOS_Floor", F)
    b.box("Gallery_RailNear", -6.0, 14.0, 12.8, 13.0, 0, 1.0, "MI_TOS_StoneDark", F)
    b.box("Gallery_RailFar", 25.0, 33.6, 12.8, 13.0, 0, 1.0, "MI_TOS_StoneDark", F)
    # Broken ends of the collapsed section, and its rubble in the sea.
    b.box("Gallery_Broken_a", 14.0, 15.2, 12.6, 13.0, -1.4, -0.3, "MI_TOS_Floor", F)
    b.box("Gallery_Broken_b", 23.6, 25.0, 10.0, 10.4, -1.6, -0.2, "MI_TOS_Floor", F)
    for i, (x, y) in enumerate(((16, 12.5), (19.5, 11.2), (22.2, 12.6))):
        b.box("Gallery_Rubble_%d" % i, x - 0.9, x + 0.9, y - 0.8, y + 0.8, -12.6, -10.8, "MI_TOS_Floor", F)
    # The cargo crate on its girder across the gap, parked on the far side.
    chasm = b.movable("Crate_Chasm", 23.9, 11.5, -0.7, (2.0, 2.0, 1.4), (-8.8, 0, 0), speed=320.0, rail_drop=1.0)
    b.column("Girder_Post_S", 13.6, 11.5, -12, -1.9, 0.3, "MI_TOS_Iron", F)
    b.column("Girder_Post_N", 25.3, 11.5, -12, -1.9, 0.3, "MI_TOS_Iron", F)
    b.ring("Ring_Chasm", unreal.TetherPointKind.PULL, 22.84, 11.5, -0.3, 180, movable=chasm)
    b.ring("Ring_A1", unreal.TetherPointKind.ANCHOR, 26.2, 10.25, 3.0, 90, landing=(26.8, 11.5, 0.0))
    # Someone tried this before: a frayed rope from the old railing, and a chalk arrow.
    b.mesh(b.cylinder, V(13.9, 12.7, -2.2), unreal.Vector(0.05, 0.05, 4.4), "MI_TOS_Cloth", "Gallery_FrayedRope", F, collide=False)
    b.text("Gallery_ChalkArrow", "IV ->", 12.6, 10.03, 1.4, 90, 34)
    b.lamp("Gallery_Lamp_Door", -3.5, 10.3, 3.2, 4000, 8)
    b.lamp("Gallery_Lamp_Far", 27.5, 10.3, 3.6, 4000, 8)
    # The washing, pegged along the wall side of the gallery, and the hooks that hold its rope.
    line = b.spawn(unreal.LaundryLine, V(-1.5, 10.55, 2.5), label="Gallery_Laundry", folder=F)
    line.set_editor_property("length", 1250.0)
    for x in (-1.5, 11.0):
        b.box("Gallery_LaundryHook_%d" % int(x), x - 0.04, x + 0.04, 10.0, 10.6, 2.46, 2.54, "MI_TOS_Iron", F, collide=False)
    # Ivo's chimes by his chalk arrow, just before the break: they ring as she walks up.
    b.spawn(unreal.WindChimes, V(12.3, 10.35, 2.7), label="Gallery_Chimes", folder=F)
    b.box("Gallery_ChimesArm", 12.0, 12.6, 10.0, 10.4, 2.7, 2.76, "MI_TOS_Iron", F, collide=False)

    # ---------------------------------------------------------------- Beat 4: the storm coupling and the gate
    F = "Coupling"
    b.box("Coupling_Housing", 29.8, 31.2, 10.0, 10.5, 0, 2.6, "MI_TOS_Hazard", F)
    b.box("Coupling_Slot", 30.35, 30.65, 10.5, 10.56, 0.9, 2.3, "MI_TOS_Iron", F)
    coupling = b.movable("Coupling", 30.5, 10.78, 2.0, (0.26, 0.5, 0.34), (0, 0, -0.95), mat="MI_TOS_Brass", speed=160.0, one_way=True, rail=False, sound="S_TOS_Clunk")
    b.ring("Ring_Coupling", unreal.TetherPointKind.PULL, 30.5, 11.06, 2.0, 90, movable=coupling)
    b.text("Coupling_Sign", "STORM COUPLING", 30.5, 10.52, 2.85, 90, 22, (40, 30, 20))
    b.text("Coupling_Sign2", "engage only at high water", 30.5, 10.52, 2.62, 90, 12, (40, 30, 20))
    b.box("Gate_PillarW", 33.6, 34.6, 9.0, 10.0, -12, 5.2, "MI_TOS_Stone", F)
    b.box("Gate_PillarE", 33.6, 34.6, 13.0, 13.8, -12, 5.2, "MI_TOS_Stone", F)
    b.box("Gate_Lintel", 33.6, 34.6, 9.0, 13.8, 4.5, 5.2, "MI_TOS_StoneDark", F)
    b.box("Gate_Sill", 33.6, 34.6, 10.0, 13.0, -12, 0, "MI_TOS_Floor", F)
    gate = b.movable("Gate", 34.1, 11.5, 2.2, (0.4, 3.0, 4.4), (0, -3.2, 0), mat="MI_TOS_Iron", speed=110.0, one_way=True, rail=False)
    alarms = [
        b.light("Alarm_Gate_W", 33.4, 10.3, 4.2, (1, 0.1, 0.05), 0.0, 10),
        b.light("Alarm_Gate_E", 33.4, 12.7, 4.2, (1, 0.1, 0.05), 0.0, 10),
        b.light("Alarm_Coupling", 30.5, 10.6, 3.2, (1, 0.1, 0.05), 0.0, 8),
        b.light("Alarm_Catwalk", 41.0, 12.8, 2.0, (1, 0.1, 0.05), 0.0, 10),
    ]
    for a in alarms:
        b.mesh(b.sphere, a.get_actor_location() + unreal.Vector(0, 0, 18), unreal.Vector(0.14, 0.14, 0.14), "MI_TOS_WarningRed", a.get_actor_label() + "_Bulb", "Lights", collide=False)

    # ---------------------------------------------------------------- Beat 5: the old catwalk
    F = "Catwalk"
    segs = []
    for i, (x0, length) in enumerate(((34.6, 6.0), (40.6, 6.0), (52.6, 6.0), (58.6, 4.0), (65.6, 8.0))):
        s = b.spawn(unreal.CollapsingSegment, V(x0, 11.5, 0), label="Catwalk_S%d" % (i + 1), folder=F)
        s.set_editor_property("size", unreal.Vector(length * 100.0, 220.0, 25.0))
        segs.append(s)
    for i, x in enumerate((40.6, 46.6, 52.6, 58.6, 62.6, 65.6, 73.6)):
        b.column("Catwalk_Pylon_%d" % i, x, 11.5, -12, -0.6, 0.22, "MI_TOS_Iron", F)
    walk = b.spawn(unreal.CollapsingWalkway, V(35.6, 11.5, 1.0), label="Catwalk_Collapse", folder=F)
    walk.set_editor_property("segments", segs)
    walk.set_editor_property("trigger_extent", unreal.Vector(80.0, 110.0, 100.0))
    b.column("A2_Pylon", 53.0, 13.95, -12, 4.6, 0.3, "MI_TOS_Iron", F)
    b.ring("Ring_A2", unreal.TetherPointKind.ANCHOR, 53.0, 13.55, 3.3, -90, landing=(54.6, 11.5, 0.0))

    # ---------------------------------------------------------------- Beat 6: the signal tower's roof
    F = "Tower"
    b.box("Tower", 83.0, 92.0, 7.0, 16.0, -12, 4.0, "MI_TOS_Stone", F)
    b.box("Tower_ParapetW", 83.0, 83.3, 7.0, 10.2, 4.0, 4.7, "MI_TOS_StoneDark", F)
    b.box("Tower_ParapetW2", 83.0, 83.3, 12.8, 16.0, 4.0, 4.7, "MI_TOS_StoneDark", F)
    b.box("Tower_ParapetS", 83.0, 92.0, 7.0, 7.3, 4.0, 4.7, "MI_TOS_StoneDark", F)
    b.box("Tower_ParapetN", 83.0, 92.0, 15.7, 16.0, 4.0, 4.7, "MI_TOS_StoneDark", F)
    b.box("Tower_ParapetE", 91.7, 92.0, 7.0, 16.0, 4.0, 4.7, "MI_TOS_StoneDark", F)
    b.ring("Ring_A3", unreal.TetherPointKind.ANCHOR, 82.95, 11.5, 3.2, 180, landing=(84.6, 11.5, 4.0))
    # Ivo's hut on the east side of the roof (the view north stays open): three walls, a roof,
    # a lamp, a note.
    b.box("Hut_Back", 85.0, 89.0, 15.4, 15.7, 4.0, 6.8, "MI_TOS_Wood", F)
    b.box("Hut_SideS", 85.0, 85.3, 13.2, 15.7, 4.0, 6.8, "MI_TOS_Wood", F)
    b.box("Hut_SideN", 88.7, 89.0, 13.2, 15.7, 4.0, 6.8, "MI_TOS_Wood", F)
    b.box("Hut_Roof", 84.8, 89.2, 13.0, 15.9, 6.8, 7.1, "MI_TOS_Iron", F)
    b.box("Hut_Stool", 88.0, 88.5, 14.6, 15.1, 4.0, 4.45, "MI_TOS_Wood", F)
    b.lamp("Hut_Lamp", 87.0, 14.4, 6.4, 6000, 7, shadows=True)
    note = b.spawn(unreal.StoryNote, V(87.0, 15.35, 5.5), (0, -90, 0), "Ivo_Note", "Story")
    note.set_editor_property("title", "Pinned to the hut wall, in Ivo's hand")
    note.set_editor_property("body",
        "Mara,\n"
        "If you are reading this, the storm engine is awake and so is Sorn. "
        "The lamp on Knoll Rock is lit because I lit it. As long as it burns, his diversion cannot run.\n"
        "There is a skiff under the light. Take the tide out at dawn, not before.\n"
        "Your mother drew the same spiral you do. Bring your drawings.\n"
        "IV")
    setp(note, True, "final", "b_final")

    # ---------------------------------------------------------------- the lighthouse and the harbour
    lighthouse_top = place_lighthouse(b)
    beam = b.spawn(unreal.LighthouseBeam, lighthouse_top, label="LighthouseBeam", folder="World")
    b.waypoint("WP_Lighthouse", lighthouse_top.x / 100.0, lighthouse_top.y / 100.0, lighthouse_top.z / 100.0)
    for i, (x, y) in enumerate(((178, 66), (184, 71), (190, 68), (196, 74))):
        b.mesh(b.sphere, V(x, y, -10.5), unreal.Vector(0.6, 0.6, 0.6), "MI_TOS_WindowGlow", "Harbour_Light_%d" % i, "World", collide=False)
    b.light("Harbour_Glow", 187, 70, -8, (1, 0.6, 0.3), 60000, 60)

    b.spawn(unreal.StormRain, V(0, 0, 0), label="Rain", folder="World")

    # ---------------------------------------------------------------- checkpoints, the director, the start
    b.checkpoint(0, "Workshop", -6.5, 0.0, 0.0, 0, "Find a way out of the workshop", (1.0, 1.0, 1.0))
    b.checkpoint(1, "Seawall gallery", -3.5, 11.5, 0.0, 0, "Follow the seawall north", (1.2, 1.5, 1.5))
    b.checkpoint(2, "Far gallery", 27.0, 11.5, 0.0, 0, "Open the sluice gate", (2.0, 1.5, 1.5))
    b.checkpoint(3, "The sluice gate", 32.6, 11.5, 0.0, 0, "", (0.6, 1.5, 1.5))
    b.checkpoint(4, "The tower", 85.6, 11.5, 4.0, 0, "Rest. Ivo left something in the hut", (1.0, 2.0, 1.5))
    b.spawn(unreal.PlayerStart, V(-6.5, 0.0, 1.0), label="PlayerStart", folder="Checkpoints")

    d = b.spawn(unreal.StormDirector, V(30.5, 12, 3), label="StormDirector", folder="Storm")
    d.set_editor_property("coupling", coupling)
    d.set_editor_property("gate", gate)
    d.set_editor_property("walkway", walk)
    d.set_editor_property("alarm_lamps", alarms)
    d.set_editor_property("climax_checkpoint_order", 3)
    if key:
        d.set_editor_property("storm_light", key)

    # ---------------------------------------------------------------- the self-test's route
    for tag, x, y, z in (
        ("WP_Toy", -6.3, -2.2, 0), ("WP_Pickup", -5.4, -2.6, 0), ("WP_DoorView", -3.5, 2.2, 0), ("WP_RoomCenter", -5.0, 0.0, 0),
        ("WP_Corridor1", -3.5, 7.6, 0), ("WP_Corridor2", -3.5, 9.6, 0), ("WP_Gallery", -3.5, 11.5, 0),
        ("WP_GalleryN", 8.0, 11.5, 0), ("WP_ChasmEdge", 13.65, 11.5, 0), ("WP_CrateFront", 15.8, 11.5, 0),
        ("WP_FarLanding", 26.8, 11.5, 0), ("WP_FallOff", 23.6, 11.5, 0), ("WP_Coupling", 30.5, 12.15, 0),
        ("WP_GateFront", 33.0, 11.5, 0), ("WP_Cat1", 36.2, 11.5, 0), ("WP_Cat2End", 46.2, 11.5, 0),
        ("WP_Cat3", 56.0, 11.5, 0), ("WP_Cat4End", 62.25, 11.5, 0), ("WP_Cat5", 67.4, 11.5, 0),
        ("WP_Cat5End", 73.2, 11.5, 0), ("WP_Note", 87.0, 14.0, 4.0), ("WP_NoteTarget", 87.0, 15.3, 5.4),
    ):
        b.waypoint(tag, x, y, z)

    les.save_current_level()
    log("level: %d actors spawned, saved %s" % (b.count, MAP))


def place_lighthouse(b):
    """
    The CC BY lighthouse scan (Chapter Three's import: the meshes textured with the scan's own
    tiles, tex_u*_v*), on a rock to the north; a stone tower if the scan is not in the project.
    """
    # Due north, in line with the catwalk: ahead through the workshop window, behind the signal
    # tower all through the climax, straight ahead from its roof.
    base = V(165, 16, -12)
    parts = []
    for path in EAL.list_assets("/Game/ItTakesOne/Chapter3_TheLowTide", recursive=True, include_folder=False):
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.StaticMesh) and any(m.material_interface and m.material_interface.get_name().startswith("tex_u") for m in asset.static_materials):
            parts.append(asset)
    b.box("Lighthouse_Rock", 158, 172, 9, 23, -13, -10.8, "MI_TOS_Rock", "World")
    if parts:
        # The parts share one frame: place them all with the first part's offset.
        bounds = parts[0].get_bounds()
        height = bounds.box_extent.z * 2.0
        loc = base + unreal.Vector(0, 0, 120) - (bounds.origin - unreal.Vector(0, 0, bounds.box_extent.z))
        for i, part in enumerate(parts):
            a = b.eas.spawn_actor_from_class(unreal.StaticMeshActor, loc, R())
            a.static_mesh_component.set_static_mesh(part)
            a.set_actor_label("Lighthouse_KnollRock_CCBY_%d" % i)
            a.set_folder_path("World")
        log("lighthouse: the scan, %d parts, %.0f cm tall" % (len(parts), height))
        return base + unreal.Vector(0, 0, 120 + height * 0.86)
    log("lighthouse: scan not found, building a tower")
    b.column("Lighthouse_Tower", 165, 16, -10.8, 14, 2.2, "MI_TOS_Stone", "World")
    return V(165, 16, 15)


def main():
    with open(LOG, "w", encoding="utf-8") as f:
        f.write("")
    log("project %s; textures from %s; audio from %s" % (PROJECT_DIR, TEXTURES_SRC, AUDIO_SRC))
    try:
        import_sounds()
        import_recorded_sounds()
        tex = import_textures()
        M = make_materials(tex)
        EAL.save_directory(ROOT, only_if_is_dirty=False, recursive=True)
        build_level(M)
        EAL.save_directory(ROOT, only_if_is_dirty=True, recursive=True)
        log("DONE")
    except Exception:
        log("ERROR\n" + traceback.format_exc())


main()
