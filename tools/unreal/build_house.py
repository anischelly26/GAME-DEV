"""
Builds the house under Knoll Rock (/Game/ItTakesOne/Maps/House): the first playable slice of
docs/STORY_HOUSE_AND_NACRE.md, steps 1 to 12. Headless, in a project where build_stormworks.py has
already run (it uses the Stormworks materials, sounds and attenuation):

    UnrealEditor-Cmd.exe <Project>.uproject -run=pythonscript -script="<repo>/tools/unreal/build_house.py" -nullrhi -unattended

It synthesises and imports the house's sounds (make_house_sounds.py, as Stormworks/Audio/H_*), makes
the house's materials, lays out the level and the grab's cinematic, and saves them. Rebuilding
replaces them. The C++ in unreal/Source/ItTakesOne/House runs it (AHouseDirector).

Metres, Unreal's frame: X north, Y east, Z up. The sea is at z -1.2.

  The jetty (x -16..-5) leads north to the cottage door (south wall, x -3).
  The cottage (x -3..6, y -4..4): the stove and kettle in the south-east corner, the dresser and the
  glass on the west wall, the floor lamp under the first west window, the table and teacup under the
  second, the bench, gauge and sink on the east wall, the hall door and the height marks on the north
  wall. The searchlight's boat is out to the west.
  The hall (x 6.25..20.5) runs north into Knoll Rock, folds down a flooded shaft, and the passage
  descends north-east to the conservatory (x 58..102, y 22..70, z -36..-4), where Nacre waits.
"""
import builtins
import math
import os
import random
import sys
import time
import traceback

import unreal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
builtins.STORMWORKS_NO_MAIN = True
import build_stormworks as sw  # noqa: E402
import make_house_sounds  # noqa: E402

V, R = sw.V, sw.R
AT, EAL, MEL, MP = sw.AT, sw.EAL, sw.MEL, sw.MP
PROJECT_DIR = sw.PROJECT_DIR
LOG = os.path.join(PROJECT_DIR, "Saved", "House_build.log")
HROOT = "/Game/ItTakesOne/House"
MAP = "/Game/ItTakesOne/Maps/House"
SEA = -1.2
rng = random.Random(7)


def log(msg):
    line = "[House] %s %s" % (time.strftime("%H:%M:%S"), msg)
    unreal.log(line)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# The Stormworks helpers report through this log too.
sw.log = log


# ------------------------------------------------------------------------------------------------
# Sounds


def import_house_sounds():
    src = os.path.join(PROJECT_DIR, "Intermediate", "HouseAudio")
    names = make_house_sounds.build(src)
    near = unreal.load_asset(sw.ROOT + "/Audio/SA_TOS_Near")
    far = unreal.load_asset(sw.ROOT + "/Audio/SA_TOS_Far")
    for n in names:
        s = sw.import_file(os.path.join(src, n + ".wav"), sw.ROOT + "/Audio", n)
        if not s:
            continue
        if n in make_house_sounds.LOOPS:
            s.set_editor_property("looping", True)
        att = near if n in make_house_sounds.NEAR else far if n in make_house_sounds.FAR else None
        if att:
            s.set_editor_property("attenuation_settings", att)
        EAL.save_loaded_asset(s, only_if_is_dirty=False)
    log("sounds: %d (%s)" % (len(names), ", ".join(names)))


# ------------------------------------------------------------------------------------------------
# Materials: two masters of the house's own (the surface one also drawn instanced, for Nacre; the
# translucent one with a rim, for the bubble and the glass) and their instances. The level also
# uses the Stormworks instances (stone, wood, iron, brass...).


def house_material(name):
    sw.fresh("%s/Materials/%s" % (HROOT, name))
    return AT.create_asset(name, HROOT + "/Materials", unreal.Material, unreal.MaterialFactoryNew())


def house_mi(name, parent, vectors=None, scalars=None):
    sw.fresh("%s/Materials/%s" % (HROOT, name))
    inst = AT.create_asset(name, HROOT + "/Materials", unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(inst, parent)
    for k, v in (vectors or {}).items():
        MEL.set_material_instance_vector_parameter_value(inst, k, unreal.LinearColor(*v))
    for k, v in (scalars or {}).items():
        MEL.set_material_instance_scalar_parameter_value(inst, k, v)
    return inst


def make_materials():
    surf = house_material("M_House_Surface")
    sw.prop(sw.vparam(surf, "BaseColor", (0.5, 0.5, 0.5, 1), -600, -200), "", MP.MP_BASE_COLOR)
    sw.prop(sw.sparam(surf, "Roughness", 0.6, -600, 0), "", MP.MP_ROUGHNESS)
    sw.prop(sw.sparam(surf, "Metallic", 0.0, -600, 100), "", MP.MP_METALLIC)
    em = sw.binop(surf, unreal.MaterialExpressionMultiply, sw.vparam(surf, "EmissiveColor", (0, 0, 0, 1), -800, 250), "",
                  sw.sparam(surf, "EmissiveStrength", 0.0, -800, 450), "", -500, 300)
    sw.prop(em, "", MP.MP_EMISSIVE_COLOR)
    surf.set_editor_property("used_with_instanced_static_meshes", True)
    MEL.recompile_material(surf)

    trans = house_material("M_House_Translucent")
    trans.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    trans.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    trans.set_editor_property("two_sided", True)
    sw.prop(sw.vparam(trans, "Color", (0.7, 0.8, 0.85, 1), -600, -100), "", MP.MP_EMISSIVE_COLOR)
    rim = sw.binop(trans, unreal.MaterialExpressionMultiply, sw.node(trans, unreal.MaterialExpressionFresnel, -900, 300), "",
                   sw.sparam(trans, "Rim", 0.0, -900, 450), "", -650, 350)
    sw.prop(sw.binop(trans, unreal.MaterialExpressionAdd, sw.sparam(trans, "Opacity", 0.25, -900, 150), "", rim, "", -400, 250), "", MP.MP_OPACITY)
    trans.set_editor_property("used_with_instanced_static_meshes", True)
    MEL.recompile_material(trans)

    # Nacre's skin: paler on the underside (vertex colour R, set by the tube), a wet rim of light.
    skin = house_material("M_House_Skin")
    tint = sw.node(skin, unreal.MaterialExpressionLinearInterpolate, -300, -150)
    sw.link(sw.vparam(skin, "BaseColor", (0.6, 0.58, 0.62, 1), -650, -250), "", tint, "A")
    sw.link(sw.vparam(skin, "BellyColor", (0.9, 0.86, 0.84, 1), -650, -60), "", tint, "B")
    sw.link(sw.node(skin, unreal.MaterialExpressionVertexColor, -650, 120), "R", tint, "Alpha")
    sw.prop(tint, "", MP.MP_BASE_COLOR)
    sw.prop(sw.sparam(skin, "Roughness", 0.32, -300, 40), "", MP.MP_ROUGHNESS)
    glow = sw.binop(skin, unreal.MaterialExpressionMultiply, sw.vparam(skin, "EmissiveColor", (0, 0, 0, 1), -800, 280), "", sw.sparam(skin, "EmissiveStrength", 0.0, -800, 460), "", -520, 330)
    rim = sw.binop(skin, unreal.MaterialExpressionMultiply, sw.node(skin, unreal.MaterialExpressionFresnel, -800, 600),  "", sw.vparam(skin, "RimColor", (0.2, 0.3, 0.34, 1), -800, 740), "", -520, 600)
    sw.prop(sw.binop(skin, unreal.MaterialExpressionAdd, glow, "", rim, "", -250, 420), "", MP.MP_EMISSIVE_COLOR)
    MEL.recompile_material(skin)

    M = {}
    for path in EAL.list_assets(sw.ROOT + "/Materials", recursive=False, include_folder=False):
        a = unreal.load_asset(path)
        if isinstance(a, unreal.MaterialInstanceConstant):
            M[a.get_name()] = a

    def s(name, base, rough=0.8, metal=0.0, emissive=(0, 0, 0, 1), strength=0.0):
        M[name] = house_mi(name, surf, {"BaseColor": base, "EmissiveColor": emissive}, {"Roughness": rough, "Metallic": metal, "EmissiveStrength": strength})

    def t(name, color, opacity, rim=0.0):
        M[name] = house_mi(name, trans, {"Color": color}, {"Opacity": opacity, "Rim": rim})

    pearl = (0.82, 0.8, 0.84, 1)
    M["MI_House_Nacre"] = house_mi("MI_House_Nacre", skin, {"BaseColor": pearl, "EmissiveColor": pearl}, {"EmissiveStrength": 0.03})
    # Nacre's body is only ever a shape against the light, or dark in the dark: no glow of its own,
    # just the wet edge.
    M["MI_House_NacreBody"] = house_mi("MI_House_NacreBody", skin, {"BaseColor": (0.012, 0.012, 0.018, 1), "BellyColor": (0.012, 0.012, 0.018, 1), "RimColor": (0.03, 0.05, 0.06, 1)}, {"Roughness": 0.9})
    s("MI_House_Sucker", (0.93, 0.86, 0.82, 1), 0.4)
    s("MI_House_NacreEye", (0.9, 0.68, 0.25, 1), 0.2, 0.0, (1.0, 0.72, 0.28, 1), 3.0)
    s("MI_House_Pupil", (0.01, 0.01, 0.012, 1), 0.1)
    # Behind her reflection: black, matte, so the window reads as night glass.
    s("MI_House_Night", (0.0, 0.0, 0.0, 1), 1.0)
    # Faded sea-green wallpaper; the rug; the painted doors.
    s("MI_House_Wallpaper", (0.3, 0.4, 0.36, 1), 0.9)
    s("MI_House_Rug", (0.42, 0.16, 0.12, 1), 1.0)
    s("MI_House_Door", (0.24, 0.3, 0.38, 1), 0.7)
    s("MI_House_Frame", (0.45, 0.32, 0.12, 1), 0.4, 0.6)
    s("MI_House_Picture", (0.3, 0.42, 0.5, 1), 0.9, 0.0, (0.3, 0.4, 0.45, 1), 0.15)
    # The conservatory's windows, each on a different sky: dawn, night, noon.
    s("MI_House_SkyDawnTop", (0.9, 0.45, 0.35, 1), 1.0, 0.0, (0.95, 0.42, 0.32, 1), 1.5)
    s("MI_House_SkyDawnLow", (1.0, 0.78, 0.45, 1), 1.0, 0.0, (1.0, 0.75, 0.42, 1), 1.8)
    s("MI_House_SkySun", (1.0, 0.92, 0.7, 1), 1.0, 0.0, (1.0, 0.9, 0.62, 1), 5.0)
    s("MI_House_SkyNightTop", (0.02, 0.03, 0.1, 1), 1.0, 0.0, (0.02, 0.03, 0.12, 1), 1.4)
    s("MI_House_SkyNightLow", (0.06, 0.1, 0.28, 1), 1.0, 0.0, (0.06, 0.1, 0.3, 1), 1.4)
    s("MI_House_SkyStar", (1, 1, 1, 1), 1.0, 0.0, (0.9, 0.95, 1.0, 1), 8.0)
    s("MI_House_SkyNoonTop", (0.22, 0.5, 0.95, 1), 1.0, 0.0, (0.22, 0.5, 0.95, 1), 1.5)
    s("MI_House_SkyNoonLow", (0.7, 0.85, 1.0, 1), 1.0, 0.0, (0.7, 0.85, 1.0, 1), 1.6)
    s("MI_House_SkyCloud", (1, 1, 1, 1), 1.0, 0.0, (1, 1, 1, 1), 2.4)
    s("MI_House_SeedGlow", (0.7, 0.9, 0.5, 1), 0.6, 0.0, (0.75, 1.0, 0.5, 1), 2.5)
    t("MI_House_Bubble", (0.3, 0.45, 0.55, 1), 0.04, 0.35)
    t("MI_House_Glass", (0.75, 0.85, 0.9, 1), 0.1, 0.3)
    # The cottage windows at night: dark glass, so her reflection shows in it.
    t("MI_House_WindowGlass", (0.03, 0.04, 0.05, 1), 0.35, 0.3)
    t("MI_House_Water", (0.25, 0.55, 0.62, 1), 0.55, 0.2)
    t("MI_House_Steam", (0.85, 0.88, 0.9, 1), 0.3)
    t("MI_House_WaterSurface", (0.12, 0.35, 0.4, 1), 0.5, 0.35)
    # The glowing seeds that drift in the flooded passages (an instanced mesh: AStormRain).
    t("MI_House_Seed", (0.7, 1.0, 0.45, 1), 0.75)
    s("MI_House_LanternGlow", (1, 0.7, 0.4, 1), 0.5, 0.0, (1, 0.62, 0.3, 1), 2.4)
    for name in [k for k in M if k.startswith("MI_House")]:
        EAL.save_loaded_asset(M[name], only_if_is_dirty=False)
    log("materials: %d house instances" % len([k for k in M if k.startswith("MI_House")]))
    return M


# ------------------------------------------------------------------------------------------------
# Geometry helpers on top of the Stormworks Builder


def movable(a):
    a.static_mesh_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    return a


def hidden_wall(b, label, x0, x1, y0, y1, z0, z1):
    """An invisible blocker: she cannot fall into the sea or jump the rails."""
    a = b.box(label, x0, x1, y0, y1, z0, z1, "MI_TOS_Stone", "Bounds")
    a.set_actor_hidden_in_game(True)
    return a


def wall(b, label, along, t0, t1, a0, a1, z0, z1, mat, holes=(), folder="Cottage"):
    """
    A wall running along X (along="x": thickness t0..t1 in Y) or Y, from a0 to a1, with rectangular
    holes [(h0, h1, hz0, hz1)] along it (doors and windows).
    """
    cuts = sorted(holes)
    edges = [a0]
    for h0, h1, _, _ in cuts:
        edges += [h0, h1]
    edges.append(a1)

    def put(name, s0, s1, za, zb):
        if s1 - s0 < 0.01 or zb - za < 0.01:
            return
        if along == "x":
            b.box(name, s0, s1, t0, t1, za, zb, mat, folder)
        else:
            b.box(name, t0, t1, s0, s1, za, zb, mat, folder)

    for i in range(len(edges) - 1):
        s0, s1 = edges[i], edges[i + 1]
        if i % 2 == 0:
            put("%s_%d" % (label, i), s0, s1, z0, z1)
        else:
            _, _, hz0, hz1 = cuts[i // 2]
            put("%s_%d_low" % (label, i), s0, s1, z0, hz0)
            put("%s_%d_high" % (label, i), s0, s1, hz1, z1)


def frame_of(a, c):
    """The frame of a segment a -> c (metres): length, rotation (pitch, yaw), forward, right, up."""
    d = [c[i] - a[i] for i in range(3)]
    length = math.sqrt(sum(x * x for x in d))
    yaw = math.atan2(d[1], d[0])
    pitch = math.atan2(d[2], math.hypot(d[0], d[1]))
    cp, sp, cy, sy = math.cos(pitch), math.sin(pitch), math.cos(yaw), math.sin(yaw)
    f = (cp * cy, cp * sy, sp)
    r = (-sy, cy, 0.0)
    u = (-sp * cy, -sp * sy, cp)
    return length, (math.degrees(pitch), math.degrees(yaw)), f, r, u


def along(a, c, k, right=0.0, up=0.0):
    _, _, _, r, u = frame_of(a, c)
    return tuple(a[i] + (c[i] - a[i]) * k + r[i] * right + u[i] * up for i in range(3))


def seg_box(b, label, a, c, right, up, size_r, size_u, mat, folder, ext=1.5, collide=False):
    length, (pitch, yaw), _, _, _ = frame_of(a, c)
    p = along(a, c, 0.5, right, up)
    return b.mesh(b.cube, V(*p), unreal.Vector(length + 2 * ext, size_r, size_u), mat, label, folder, rot=(pitch, yaw, 0), collide=collide)


def tube(b, label, a, c, w, h, outer, inner=None, floor=None, t=0.3, folder="Descent"):
    """A passage from a to c, w wide and h high inside: stone outside, papered or bare inside."""
    seg_box(b, label + "_Floor", a, c, 0, -(h + t) / 2, w + 2 * t, t, outer, folder)
    seg_box(b, label + "_Ceiling", a, c, 0, (h + t) / 2, w + 2 * t, t, outer, folder)
    seg_box(b, label + "_WallL", a, c, -(w + t) / 2, 0, t, h, outer, folder)
    seg_box(b, label + "_WallR", a, c, (w + t) / 2, 0, t, h, outer, folder)
    if inner:
        seg_box(b, label + "_PaperL", a, c, -(w / 2 - 0.01), 0, 0.02, h, inner, folder, ext=1.45)
        seg_box(b, label + "_PaperR", a, c, w / 2 - 0.01, 0, 0.02, h, inner, folder, ext=1.45)
        seg_box(b, label + "_PaperTop", a, c, 0, h / 2 - 0.01, w, 0.02, inner, folder, ext=1.45)
    if floor:
        seg_box(b, label + "_Boards", a, c, 0, -(h / 2 - 0.01), w, 0.02, floor, folder, ext=1.45)


def chair(b, label, x, y, z, yaw, folder, mat="MI_TOS_Wood", rot=None):
    """A kitchen chair: the seat actor (the back is attached to it)."""
    rr = rot or (0, yaw, 0)
    seat = movable(b.mesh(b.cube, V(x, y, z + 0.45), unreal.Vector(0.44, 0.44, 0.05), mat, label, folder, rot=rr))
    tr = unreal.Transform(V(x, y, z + 0.45), R(*rr), unreal.Vector(1, 1, 1))
    legs = []
    for i, (dx, dy) in enumerate(((0.19, 0.19), (0.19, -0.19), (-0.19, 0.19), (-0.19, -0.19))):
        legs.append(b.mesh(b.cube, tr.transform_location(unreal.Vector(dx * 100, dy * 100, -23)), unreal.Vector(0.04, 0.04, 0.44), mat, "%s_Leg%d" % (label, i), folder, rot=rr, collide=False))
    back = b.mesh(b.cube, tr.transform_location(unreal.Vector(-20, 0, 25)), unreal.Vector(0.04, 0.44, 0.5), mat, label + "_Back", folder, rot=rr, collide=False)
    for part in legs + [back]:
        movable(part)
        part.attach_to_actor(seat, "", unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, False)
    return seat


def door_panel(b, label, loc, rot, folder, mat="MI_House_Door", collide=True, w=0.9, h=2.0):
    """A door: panel, two inset panes and a brass knob (both faces), the parts attached to the panel."""
    d = movable(b.mesh(b.cube, V(*loc), unreal.Vector(w, 0.06, h), mat, label, folder, rot=rot, collide=collide))
    tr = unreal.Transform(V(*loc), R(*rot), unreal.Vector(1, 1, 1))
    parts = []
    for side in (-1, 1):
        parts += [
            b.mesh(b.cube, tr.transform_location(unreal.Vector(0, side * 3.5, h * 22.5)), unreal.Vector(w * 0.67, 0.02, h * 0.35), "MI_House_Frame", "%s_PaneTop%d" % (label, side), folder, rot=rot, collide=False),
            b.mesh(b.cube, tr.transform_location(unreal.Vector(0, side * 3.5, -h * 22.5)), unreal.Vector(w * 0.67, 0.02, h * 0.35), "MI_House_Frame", "%s_PaneLow%d" % (label, side), folder, rot=rot, collide=False),
            b.mesh(b.sphere, tr.transform_location(unreal.Vector(w * 39, side * 6, 0)), unreal.Vector(0.07, 0.07, 0.07), "MI_TOS_Brass", "%s_Knob%d" % (label, side), folder, rot=rot, collide=False),
        ]
    for p in parts:
        movable(p)
        p.attach_to_actor(d, "", unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, False)
    return d


def picture(b, label, loc, rot, w, h, folder):
    f = movable(b.mesh(b.cube, V(*loc), unreal.Vector(0.05, w, h), "MI_House_Frame", label, folder, rot=rot))
    tr = unreal.Transform(V(*loc), R(*rot), unreal.Vector(1, 1, 1))
    p = b.mesh(b.cube, tr.transform_location(unreal.Vector(3, 0, 0)), unreal.Vector(0.01, w - 0.08, h - 0.08), "MI_House_Picture", label + "_Canvas", folder, rot=rot, collide=False)
    movable(p)
    p.attach_to_actor(f, "", unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, False)
    return f


def point_light(b, label, x, y, z, color, intensity, radius, shadows=False, folder="Lights"):
    a = b.light(label, x, y, z, color, intensity, radius, folder, shadows)
    c = a.get_component_by_class(unreal.PointLightComponent)
    c.set_mobility(unreal.ComponentMobility.MOVABLE)
    # Volumetric fog pays for every local light it scatters: on a laptop GPU, only the searchlight does.
    c.set_editor_property("volumetric_scattering_intensity", 0.0)
    return a


def tentacle(b, label, base, rot, folder="Nacre", **props):
    a = b.spawn(unreal.NacreTentacle, V(*base), rot, label, folder)
    for k, v in props.items():
        sw.setp(a, v, k, "b_" + k)
    return a


def crag(b, label, cx, cy, z0, z1, radius, n, folder="World"):
    """A rock with no box corners: rough tilted slabs overlapping, narrowing as they rise."""
    for i in range(n):
        k = i / max(n - 1, 1)
        r = radius * (1 - 0.74 * k) * rng.uniform(0.8, 1.1)
        a = rng.uniform(0, 2 * math.pi)
        d = radius * (1 - k) * rng.uniform(0.1, 0.62)
        z = z0 + (z1 - z0) * k
        size = unreal.Vector(r * rng.uniform(1.2, 1.7), r * rng.uniform(1.1, 1.6), (z1 - z0) * rng.uniform(0.2, 0.34))
        b.mesh(b.cube, V(cx + math.cos(a) * d, cy + math.sin(a) * d, z), size, "MI_TOS_Rock", "%s_%d" % (label, i), folder,
               rot=(rng.uniform(-15, 15), rng.uniform(0, 360), rng.uniform(-15, 15)), collide=False)


def rot_from_z(d):
    """The rotation (pitch, yaw, roll) that turns an actor's up vector toward d."""
    r = unreal.MathLibrary.make_rot_from_z(unreal.Vector(*d))
    return (r.pitch, r.yaw, r.roll)


def place_lighthouse(b, base):
    """The CC BY lighthouse scan from Chapter Three on Knoll Rock; a stone tower if it is missing."""
    parts = []
    for path in EAL.list_assets("/Game/ItTakesOne/Chapter3_TheLowTide", recursive=True, include_folder=False):
        asset = unreal.load_asset(path)
        if isinstance(asset, unreal.StaticMesh) and any(m.material_interface and m.material_interface.get_name().startswith("tex_u") for m in asset.static_materials):
            parts.append(asset)
    if parts:
        bounds = parts[0].get_bounds()
        height = bounds.box_extent.z * 2.0
        loc = base - (bounds.origin - unreal.Vector(0, 0, bounds.box_extent.z))
        for i, part in enumerate(parts):
            a = b.eas.spawn_actor_from_class(unreal.StaticMeshActor, loc, R())
            a.static_mesh_component.set_static_mesh(part)
            a.set_actor_label("Lighthouse_KnollRock_CCBY_%d" % i)
            a.set_folder_path("World")
        log("lighthouse: the scan, %d parts, %.0f cm tall" % (len(parts), height))
        return base + unreal.Vector(0, 0, height * 0.86)
    log("lighthouse: scan not found, building a tower")
    b.column("Lighthouse_Tower", base.x / 100.0, base.y / 100.0, base.z / 100.0, base.z / 100.0 + 13, 1.6, "MI_TOS_Stone", "World")
    return base + unreal.Vector(0, 0, 1300)


# ------------------------------------------------------------------------------------------------
# The level

# Where things are (metres), shared by the geometry, the director and the self-test's waypoints.
SINK_DRAIN = (4.05, 3.6, 0.88)
FLOOR_DRAIN = (1.9, -2.9, 0.05)
GAUGE = (1.8, 3.55, 0.95)
TEACUP = (3.62, -1.8, 0.78)
TEACUP_SPOT = (3.88, -1.98, 0.86)
LAMP = (2.2, -3.4)
LAMP_SPOT = (2.25, -3.32, 1.5)
# The water glass on the sill of the first west window: looking at it, she faces her reflection.
GLASS = (0.6, -3.86, 1.0)
GRAB_SPOT = (2.6, 0.4, 0.97)
GRAB_YAW = -150.0
HALL_DOOR = (6.0, 6.25, 1.6, 3.4, 2.6)  # x0, x1, y0, y1, height
HALL_START = (7.4, 2.5, 1.4)
PATH = [
    (7.4, 2.5, 1.4), (12.0, 2.5, 2.0), (18.0, 2.5, 2.0), (22.5, 2.5, 0.0), (25.0, 3.0, -5.0),
    (29.0, 6.0, -10.0), (36.0, 11.0, -14.0), (44.0, 18.0, -17.0), (51.0, 25.0, -19.0), (57.0, 30.0, -20.0),
]
REVEAL_ENTRY = (59.5, 31.0, -20.0)
OFFER_SPOT = (65.0, 34.5, -19.8)
# Nacre rests in the dark below her (NACRE); in the reveal it first passes across the dawn window.
NACRE = (72.0, 40.0, -30.0)
NACRE_FROM = (96.0, 34.0, -16.0)
NACRE_RADIUS = 2.4


def build_exterior(b):
    F = "World"
    # The sea, with a hole where the house's passages go down through it (rock fills it).
    for i, (x0, x1, y0, y1) in enumerate(((-300, 6, -300, 300), (32, 300, -300, 300), (6, 32, -300, -4), (6, 32, 9, 300))):
        b.box("Sea_%d" % i, x0, x1, y0, y1, SEA - 0.1, SEA, "MI_TOS_Sea", F, collide=False)
    b.box("Causeway_Rock", 6, 32, -4, 9, -4, 0.0, "MI_TOS_Rock", F, collide=False)
    for i, (x, y, s) in enumerate(((-9, -7, 2.2), (-12, 5, 1.6), (-20, -4, 2.8), (2, -11, 3.0), (12, 12, 2.4), (-6, 10, 1.8), (40, -6, 3.4))):
        crag(b, "SeaRock_%d" % i, x, y, SEA - 1.0, SEA + s * 0.4, s, 4)

    # The island the cottage stands on, its low walls, and the jetty.
    b.box("Island_Rock", -5, 8, -6, 6, -4, -0.05, "MI_TOS_Rock", F)
    b.box("Island_Top", -5, 8, -6, 6, -0.05, 0.0, "MI_TOS_Floor", F)
    for name, x0, x1, y0, y1 in (("S_W", -5, -4.8, -6, -1.2), ("S_E", -5, -4.8, 1.2, 6), ("W", -5, 8, -6, -5.8), ("E", -5, 8, 5.8, 6),
                                 ("N_W", 7.8, 8, -6, -0.3), ("N_E", 7.8, 8, 5.3, 6)):
        b.box("Island_Wall_" + name, x0, x1, y0, y1, 0, 0.9, "MI_TOS_StoneDark", F)
        hidden_wall(b, "Island_Bound_" + name, x0, x1, y0, y1, 0.9, 4.0)
    b.box("Jetty_Deck", -16.5, -4.8, -1.2, 1.2, -0.3, 0.0, "MI_TOS_Wood", F)
    for i in range(7):
        x = -16 + i * 1.9
        for y in (-1.1, 1.1):
            b.column("Jetty_Post_%d_%s" % (i, "W" if y < 0 else "E"), x, y, SEA - 1.5, 0.9, 0.09, "MI_TOS_Wood", F)
    for y, n in ((-1.15, "W"), (1.15, "E")):
        b.box("Jetty_Rail_" + n, -16.5, -5, y - 0.04, y + 0.04, 0.82, 0.9, "MI_TOS_Wood", F)
        hidden_wall(b, "Jetty_Bound_" + n, -16.5, -4.8, y - 0.1, y + 0.1, 0.0, 4.0)
    b.box("Jetty_RailEnd", -16.55, -16.45, -1.2, 1.2, 0.82, 0.9, "MI_TOS_Wood", F)
    hidden_wall(b, "Jetty_Bound_End", -16.8, -16.5, -1.2, 1.2, 0.0, 4.0)
    b.lamp("Jetty_Lamp", -5.6, -1.1, 2.0, 2500.0, 8.0)
    b.column("Jetty_LampPost", -5.6, -1.1, 0.0, 1.9, 0.05, "MI_TOS_Iron", F)
    # Ivo's things by the door: a barrel, a crate, a coil of rope, a net float.
    b.column("Prop_Barrel", -4.2, -2.4, 0.0, 0.95, 0.33, "MI_TOS_Wood", F)
    b.column("Prop_BarrelHoop", -4.2, -2.4, 0.62, 0.68, 0.345, "MI_TOS_Iron", F)
    b.mesh(b.cube, V(-4.1, 2.3, 0.3), unreal.Vector(0.8, 0.7, 0.6), "MI_TOS_Crate", "Prop_Crate", F, rot=(0, 18, 0))
    for i in range(3):
        b.mesh(b.cylinder, V(-4.05, 1.25, 0.05 + i * 0.07), unreal.Vector(0.62 - i * 0.06, 0.62 - i * 0.06, 0.07), "MI_TOS_Cloth", "Prop_Rope_%d" % i, F, collide=False)
    # Hung flat against the wall, clear of the camera's way through the door.
    b.mesh(b.sphere, V(-3.38, -2.5, 2.05), unreal.Vector(0.26, 0.26, 0.26), "MI_TOS_ToyRed", "Prop_Float", F, collide=False)
    b.text("Prop_Mailbox", "I. VENN", -3.27, -1.6, 1.3, 180, 11, (150, 130, 95))

    # Knoll Rock behind the house, with its light.
    crag(b, "KnollRock", 33, 27, -3.0, 9.0, 20.0, 30)
    crag(b, "KnollRock_Spur", 16, 16, -3.0, 2.5, 8.0, 10)
    # The scan's feet end in the fragments of the plaza it was scanned on: they sit in the rock's top.
    b.mesh(b.cube, V(33, 27, 8.6), unreal.Vector(17, 17, 2.0), "MI_TOS_Rock", "KnollRock_Top", F, rot=(2, 25, -3), collide=False)
    top = place_lighthouse(b, V(33, 27, 8.2))
    # A little cold light on the rock's near face, so it has a shape in the storm.
    point_light(b, "KnollRock_Fill", 20, 14, 10, (0.55, 0.68, 0.85), 26000.0, 34.0, folder=F)
    b.spawn(unreal.LighthouseBeam, top, label="LighthouseBeam", folder=F)

    # Breakwater, far to the south: someone is always awake there.
    b.box("Prison_Far", -150, -120, -40, 30, SEA - 1, 22, "MI_TOS_StoneDark", "Prison", collide=False)
    for i in range(6):
        b.box("Prison_Far_Window_%d" % i, -119.95, -119.85, -30 + i * 10, -29 + i * 10, 8 + (i % 3) * 4, 9.4 + (i % 3) * 4, "MI_TOS_WindowGlow", "Prison", collide=False)

    # The Watch's boat out to the west, and its searchlight.
    b.box("WatchBoat_Hull", -1.5, 5.5, -26, -23.6, SEA - 0.6, SEA + 1.0, "MI_TOS_Iron", "Watch", collide=False)
    b.box("WatchBoat_Cabin", 0.5, 3.5, -25.6, -24.0, SEA + 1.0, SEA + 3.0, "MI_TOS_StoneDark", "Watch", collide=False)
    b.box("WatchBoat_Lamp", 1.7, 2.3, -24.4, -23.9, SEA + 3.0, SEA + 3.6, "MI_TOS_LampGlow", "Watch", collide=False)
    s = b.spawn(unreal.SpotLight, V(2.1, -23.6, 4.6), (-8, 45, 0), "Searchlight", "Watch")
    c = s.get_component_by_class(unreal.SpotLightComponent)
    c.set_mobility(unreal.ComponentMobility.MOVABLE)
    c.set_editor_property("intensity_units", unreal.LightUnits.UNITLESS)
    c.set_editor_property("intensity", 0.0)
    c.set_editor_property("light_color", sw.C(205, 225, 255))
    c.set_editor_property("attenuation_radius", 6000.0)
    c.set_editor_property("outer_cone_angle", 11.0)
    c.set_editor_property("inner_cone_angle", 5.0)
    c.set_editor_property("cast_shadows", True)
    return s


def build_cottage(b):
    F = "Cottage"
    b.box("Cottage_Floor", -3, 6, -4, 4, 0.0, 0.04, "MI_TOS_Wood", F)
    b.box("Cottage_Rug", -0.2, 2.0, -1.4, 1.6, 0.04, 0.05, "MI_House_Rug", F, collide=False)
    # Walls: the door and a window to the south (toward the jetty), two windows west (toward the
    # searchlight), one over the sink east, the hall door north.
    wall(b, "Cottage_WallS", "y", -3.25, -3.0, -4.25, 4.25, 0, 3.15, "MI_TOS_Stone", [(-0.6, 0.6, 0.0, 2.3), (1.6, 2.8, 1.0, 2.0)])
    wall(b, "Cottage_WallW", "x", -4.25, -4.0, -3.25, 6.25, 0, 3.15, "MI_TOS_Stone", [(0.0, 1.2, 1.0, 2.2), (3.0, 4.2, 1.0, 2.2)])
    wall(b, "Cottage_WallE", "x", 4.0, 4.25, -3.25, 6.25, 0, 3.15, "MI_TOS_Stone", [(3.6, 4.6, 1.4, 2.2)])
    x0, x1, y0, y1, hh = HALL_DOOR
    wall(b, "Cottage_WallN", "y", x0, x1, -4.25, 4.25, 0, 3.15, "MI_TOS_Stone", [(y0, y1, 0.0, hh)])
    for name, a, c, lo, hi, z0, z1 in (("S", -3.2, -3.05, 1.6, 2.8, 1.0, 2.0), ("W0", 0.0, 1.2, -4.2, -4.05, 1.0, 2.2), ("W1", 3.0, 4.2, -4.2, -4.05, 1.0, 2.2), ("E", 3.6, 4.6, 4.05, 4.2, 1.4, 2.2)):
        b.box("Cottage_Glass_" + name, a, c, lo, hi, z0, z1, "MI_House_WindowGlass", F, collide=False)
    # The door frame (no door: it stands open, the storm blowing in) and a nameplate.
    b.box("Cottage_DoorFrameW", -3.3, -2.95, -0.72, -0.6, 0, 2.4, "MI_TOS_Wood", F)
    b.box("Cottage_DoorFrameE", -3.3, -2.95, 0.6, 0.72, 0, 2.4, "MI_TOS_Wood", F)
    b.box("Cottage_DoorFrameTop", -3.3, -2.95, -0.72, 0.72, 2.3, 2.42, "MI_TOS_Wood", F)
    b.text("Cottage_Nameplate", "I. VENN", -3.27, 0.0, 2.48, 180, 14, (60, 48, 30))
    b.box("Cottage_Ceiling", -3, 6, -4, 4, 3.0, 3.12, "MI_TOS_Wood", F)
    for i in range(4):
        b.box("Cottage_Beam_%d" % i, -3, 6, -3.0 + i * 2.0, -2.84 + i * 2.0, 2.84, 3.0, "MI_TOS_Wood", F, collide=False)
    # The roof: two slabs and stepped stone gables.
    for side, roll in ((-1, -25.0), (1, 25.0)):
        b.mesh(b.cube, V(1.5, side * 2.3, 4.08), unreal.Vector(9.9, 5.1, 0.18), "MI_TOS_StoneDark", "Cottage_Roof_%s" % ("W" if side < 0 else "E"), F, rot=(0, 0, roll), collide=False)
    for gx0, gx1, n in ((-3.25, -3.0, "S"), (6.0, 6.25, "N")):
        for k, half in enumerate((4.04, 2.96, 1.89, 0.82)):
            b.box("Cottage_Gable%s_%d" % (n, k), gx0, gx1, -half, half, 3.15 + 0.5 * k, 3.65 + 0.5 * k, "MI_TOS_Stone", F, collide=False)
    # Warm light in the south window, seen from the jetty: a one-sided plane facing out, so from
    # inside the window still shows the storm.
    b.mesh(b.plane, V(-3.12, 2.2, 1.5), unreal.Vector(1.0, 1.2, 1.0), "MI_House_LanternGlow", "Cottage_WindowGlowS", F, rot=(90, 0, 0), collide=False)


def build_furniture(b):
    F = "Furniture"
    rattles = []
    lamps = []
    # The stove in the south-east corner, its pipe, the pots over it.
    b.box("Stove", -2.7, -1.9, 2.9, 3.9, 0, 0.9, "MI_TOS_Iron", F)
    b.box("Stove_Grate", -2.72, -2.7, 3.1, 3.7, 0.15, 0.45, "MI_TOS_LampGlow", F, collide=False)
    b.column("Stove_Pipe", -2.55, 3.72, 0.9, 4.4, 0.08, "MI_TOS_Iron", F)
    lamps.append(point_light(b, "Stove_Glow", -2.9, 3.4, 0.35, (1.0, 0.45, 0.15), 1200.0, 3.0))
    b.box("Pot_Rail", -2.9, -1.7, 3.85, 3.92, 2.1, 2.14, "MI_TOS_Iron", F, collide=False)
    for i, (x, s) in enumerate(((-2.6, 0.22), (-2.25, 0.18), (-1.95, 0.26))):
        rattles.append(movable(b.mesh(b.cylinder, V(x, 3.78, 1.85), unreal.Vector(s, s, s * 0.7), "MI_TOS_Brass" if i % 2 else "MI_TOS_Iron", "Pot_%d" % i, F, collide=False)))

    # The bench along the east wall: tools, papers, a lamp; the sink at its end.
    b.box("Bench_Top", 0.4, 3.2, 3.2, 4.0, 0.85, 0.95, "MI_TOS_Wood", F)
    for i, (x, y) in enumerate(((0.5, 3.3), (0.5, 3.9), (3.1, 3.3), (3.1, 3.9))):
        b.box("Bench_Leg_%d" % i, x - 0.04, x + 0.04, y - 0.04, y + 0.04, 0, 0.85, "MI_TOS_Wood", F, collide=False)
    b.box("Bench_Shelf", 0.4, 3.2, 3.2, 3.5, 0.2, 0.25, "MI_TOS_Wood", F, collide=False)
    b.box("Bench_Toolbox", 0.6, 1.1, 3.6, 3.95, 0.95, 1.2, "MI_TOS_ToyRed", F, collide=False)
    b.box("Bench_Vise", 2.75, 2.95, 3.25, 3.45, 0.95, 1.1, "MI_TOS_Iron", F, collide=False)
    for i in range(4):
        b.box("Bench_Paper_%d" % i, 1.25 + i * 0.12, 1.55 + i * 0.12, 3.3 + (i % 2) * 0.08, 3.52 + (i % 2) * 0.08, 0.95 + i * 0.003, 0.953 + i * 0.003, "MI_TOS_Paper", F, collide=False)
    b.box("Bench_Pegboard", 0.4, 3.2, 3.97, 4.0, 1.2, 2.2, "MI_TOS_Wood", F, collide=False)
    for i in range(7):
        rattles.append(movable(b.box("Bench_Tool_%d" % i, 0.6 + i * 0.36, 0.64 + i * 0.36, 3.93, 3.96, 1.35 + (i % 3) * 0.1, 1.75 + (i % 3) * 0.1, "MI_TOS_Iron", F, collide=False)))
    b.column("Bench_LampArm", 1.0, 3.85, 0.95, 1.5, 0.015, "MI_TOS_Brass", F)
    b.mesh(b.sphere, V(1.0, 3.75, 1.45), unreal.Vector(0.1, 0.1, 0.12), "MI_TOS_LampGlow", "Bench_LampBulb", F, collide=False)
    b.box("Sink_Cabinet", 3.4, 4.7, 3.2, 4.0, 0, 0.86, "MI_TOS_Wood", F)
    b.box("Sink_RimN", 3.4, 4.7, 3.2, 3.28, 0.86, 0.92, "MI_TOS_Iron", F, collide=False)
    b.box("Sink_RimS", 3.4, 4.7, 3.92, 4.0, 0.86, 0.92, "MI_TOS_Iron", F, collide=False)
    b.box("Sink_RimW", 3.4, 3.48, 3.2, 4.0, 0.86, 0.92, "MI_TOS_Iron", F, collide=False)
    b.box("Sink_RimE", 4.62, 4.7, 3.2, 4.0, 0.86, 0.92, "MI_TOS_Iron", F, collide=False)
    b.box("Sink_Basin", 3.48, 4.62, 3.28, 3.92, 0.84, 0.86, "MI_TOS_Iron", F, collide=False)
    b.column("Sink_Drain", SINK_DRAIN[0], SINK_DRAIN[1], 0.855, 0.865, 0.05, "MI_TOS_StoneDark", F)
    b.column("Sink_Tap", 4.05, 3.95, 0.92, 1.2, 0.02, "MI_TOS_Brass", F)

    # The table and the teacup, two chairs, a bottle shelf over the west window.
    b.box("Table_Top", 3.4, 4.8, -2.6, -1.4, 0.74, 0.78, "MI_TOS_Wood", F)
    for i, (x, y) in enumerate(((3.5, -2.5), (3.5, -1.5), (4.7, -2.5), (4.7, -1.5))):
        b.box("Table_Leg_%d" % i, x - 0.04, x + 0.04, y - 0.04, y + 0.04, 0, 0.74, "MI_TOS_Wood", F, collide=False)
    cup = movable(b.mesh(b.cylinder, V(TEACUP[0], TEACUP[1], TEACUP[2] + 0.04), unreal.Vector(0.08, 0.08, 0.08), "MI_TOS_Paper", "Teacup", F, collide=False))
    b.mesh(b.cylinder, V(TEACUP[0], TEACUP[1], TEACUP[2] + 0.005), unreal.Vector(0.14, 0.14, 0.01), "MI_TOS_Paper", "Teacup_Saucer", F, collide=False)
    rattles.append(cup)
    rattles.append(movable(b.mesh(b.cylinder, V(4.3, -2.2, 0.86), unreal.Vector(0.1, 0.1, 0.16), "MI_TOS_Brass", "Teapot", F, collide=False)))
    for i, (x, y, yaw) in enumerate(((4.1, -3.15, 90), (2.85, -2.0, 0))):
        rattles.append(movable(chair(b, "Chair_%d" % i, x, y, 0.0, yaw, F)))
    for i in range(5):
        rattles.append(movable(b.mesh(b.cylinder, V(3.2 + i * 0.22, -3.86, 2.42), unreal.Vector(0.07, 0.07, 0.24), "MI_House_Glass" if i % 2 else "MI_TOS_Laundry_2", "Bottle_%d" % i, F, collide=False)))
    b.box("Bottle_Shelf", 3.0, 4.3, -4.0, -3.72, 2.28, 2.3, "MI_TOS_Wood", F, collide=False)

    # The dresser (the glass is on it) and the floor lamp under the west window.
    b.box("Dresser", -2.1, -0.7, -3.98, -3.45, 0, 0.9, "MI_TOS_Wood", F)
    for i in range(3):
        b.box("Dresser_Drawer_%d" % i, -2.0, -0.8, -3.46, -3.44, 0.1 + i * 0.27, 0.32 + i * 0.27, "MI_House_Door", F, collide=False)
    rattles.append(movable(picture(b, "Picture_Lighthouse", (-1.4, -3.97, 1.75), (0, 90, 0), 0.7, 0.5, F)))
    b.column("FloorLamp_Pole", LAMP[0], LAMP[1], 0.0, 1.45, 0.02, "MI_TOS_Brass", F)
    b.column("FloorLamp_Base", LAMP[0], LAMP[1], 0.0, 0.04, 0.16, "MI_TOS_Brass", F)
    b.mesh(b.cylinder, V(LAMP[0], LAMP[1], 1.55), unreal.Vector(0.5, 0.5, 0.3), "MI_TOS_Cloth", "FloorLamp_Shade", F, collide=False)
    b.mesh(b.sphere, V(LAMP[0], LAMP[1], 1.45), unreal.Vector(0.1, 0.1, 0.12), "MI_TOS_LampGlow", "FloorLamp_Bulb", F, collide=False)
    lamps.append(point_light(b, "FloorLamp_Light", LAMP[0], LAMP[1], 1.3, (1.0, 0.68, 0.4), 1800.0, 5.0))
    b.column("FloorDrain", FLOOR_DRAIN[0], FLOOR_DRAIN[1], 0.04, 0.05, 0.12, "MI_TOS_Grate", F)

    # The hanging lamp over the room (the one that casts shadows) and the bench lamp.
    b.column("CeilingLamp_Cord", 1.5, 0.0, 2.65, 3.0, 0.01, "MI_TOS_Iron", F)
    shade = movable(b.mesh(b.cylinder, V(1.5, 0.0, 2.62), unreal.Vector(0.36, 0.36, 0.14), "MI_TOS_Brass", "CeilingLamp_Shade", F, collide=False))
    shade.static_mesh_component.set_cast_shadow(False)
    rattles.append(shade)
    # Neither the bulb nor the shade may shadow the lamp's own light: that was a black disc on the ceiling.
    bulb = b.mesh(b.sphere, V(1.5, 0.0, 2.52), unreal.Vector(0.12, 0.12, 0.12), "MI_TOS_LampGlow", "CeilingLamp_Bulb", F, collide=False)
    bulb.static_mesh_component.set_cast_shadow(False)
    lamps.append(point_light(b, "CeilingLamp", 1.5, 0.0, 2.4, (1.0, 0.72, 0.45), 4200.0, 9.0, shadows=True))
    lamps.append(point_light(b, "BenchLamp", 1.0, 3.6, 1.3, (1.0, 0.7, 0.42), 1600.0, 4.0))
    return rattles, lamps


def build_details(b):
    F = "Story"
    det = []

    def detail(label, kind, loc, yaw, drain):
        a = b.spawn(unreal.HouseDetail, V(*loc), (0, yaw, 0), label, F)
        a.set_editor_property("kind", kind)
        a.set_editor_property("drain_location", V(*drain))
        return a

    gauge = detail("Gauge", unreal.HouseDetailKind.GAUGE, GAUGE, 20, SINK_DRAIN)
    det.append(detail("Kettle", unreal.HouseDetailKind.KETTLE, (-2.2, 3.25, 0.9), 200, FLOOR_DRAIN))
    # Pencilled on the hall doorframe's pale trim.
    b.box("HallDoor_Trim", 5.94, 6.0, 1.12, 1.5, 0.0, 2.6, "MI_TOS_Paper", F, collide=False)
    det.append(detail("HeightMarks", unreal.HouseDetailKind.HEIGHT_MARKS, (5.93, 1.16, 1.4), 180, FLOOR_DRAIN))
    b.box("Window_Sill", -0.1, 1.3, -4.02, -3.74, 0.94, 1.0, "MI_TOS_Wood", F, collide=False)
    det.append(detail("WaterGlass", unreal.HouseDetailKind.WATER_GLASS, GLASS, 0, FLOOR_DRAIN))
    return gauge, det


def build_hall(b):
    """The hall north into the rock (its door shut until the grab), then the fold and the passage."""
    F = "Hall"
    x0, x1, y0, y1, hh = HALL_DOOR
    door = door_panel(b, "HallDoor", (6.11, (y0 + y1) / 2, hh / 2), (0, 90, 0), F, w=y1 - y0 - 0.04, h=hh - 0.04)
    hinge = (6.11, y1 - 0.02, 0.0)
    b.box("HallDoor_FrameTop", 5.95, 6.3, y0 - 0.1, y1 + 0.1, hh, hh + 0.12, "MI_TOS_Wood", F, collide=False)
    b.box("HallDoor_FrameL", 5.95, 6.3, y0 - 0.1, y0, 0, hh, "MI_TOS_Wood", F, collide=False)
    b.box("HallDoor_FrameR", 5.95, 6.3, y1, y1 + 0.1, 0, hh, "MI_TOS_Wood", F, collide=False)

    # The long hall: stone outside, papered inside, boards underfoot, a lamp or two.
    hx0, hx1 = 6.25, 20.5
    b.box("Hall_Floor", hx0, hx1, -0.1, 5.1, -0.3, 0.0, "MI_TOS_Wood", F, collide=False)
    b.box("Hall_Roof", hx0, hx1, -0.1, 5.1, 4.6, 4.9, "MI_TOS_StoneDark", F, collide=False)
    b.box("Hall_WallW", hx0, hx1, -0.1, 0.2, 0.0, 4.6, "MI_TOS_Stone", F, collide=False)
    b.box("Hall_WallE", hx0, hx1, 4.8, 5.1, 0.0, 4.6, "MI_TOS_Stone", F, collide=False)
    b.box("Hall_PaperW", hx0, hx1, 0.2, 0.22, 0.0, 4.6, "MI_House_Wallpaper", F, collide=False)
    b.box("Hall_PaperE", hx0, hx1, 4.78, 4.8, 0.0, 4.6, "MI_House_Wallpaper", F, collide=False)
    b.box("Hall_Runner", hx0, hx1, 1.9, 3.1, 0.0, 0.01, "MI_House_Rug", F, collide=False)
    lamps = []
    for i, x in enumerate((9.5, 15.5)):
        b.mesh(b.sphere, V(x, 2.5, 4.3), unreal.Vector(0.18, 0.18, 0.18), "MI_TOS_LampGlow", "Hall_Bulb_%d" % i, F, collide=False)
        lamps.append(point_light(b, "Hall_Lamp_%d" % i, x, 2.5, 4.1, (1.0, 0.7, 0.42), 2600.0, 7.0))
    # Doors along both walls, to rooms that are not there; pictures between them.
    for i, x in enumerate((8.5, 12.0, 15.5, 19.0)):
        for y, yaw, n in ((0.24, 90, "W"), (4.76, -90, "E")):
            door_panel(b, "Hall_SideDoor_%d%s" % (i, n), (x, y, 1.0), (0, yaw, 0), F, collide=False)
        picture(b, "Hall_Picture_%dW" % i, (x + 1.7, 0.25, 2.0 + (i % 2) * 0.3), (0, 90, 0), 0.6, 0.45, F)
    # The fold: the hall tips down, still papered, and becomes the shaft into the flood.
    tube(b, "Fold", PATH[2], PATH[3], 4.6, 4.6, "MI_TOS_Stone", inner="MI_House_Wallpaper", floor="MI_TOS_Wood", folder=F)
    # Stone walls round the fold and the head of the shaft, hiding the joins from outside.
    b.box("FoldHouse_W", 19.5, 27.5, -1.6, -1.3, -0.5, 6.0, "MI_TOS_Stone", F, collide=False)
    b.box("FoldHouse_E", 19.5, 27.5, 6.3, 6.6, -0.5, 6.0, "MI_TOS_Stone", F, collide=False)
    b.box("FoldHouse_Roof", 19.5, 27.8, -1.6, 6.6, 6.0, 6.3, "MI_TOS_StoneDark", F, collide=False)
    b.box("FoldHouse_N", 27.5, 27.8, -1.6, 6.6, -0.5, 6.0, "MI_TOS_Stone", F, collide=False)
    return door, hinge, lamps


def build_descent(b):
    F = "Descent"
    obstacles = []
    # The flooded passage down to the conservatory: bare rock, a dim teal light now and then.
    for i in range(3, len(PATH) - 1):
        tube(b, "Passage_%d" % i, PATH[i], PATH[i + 1], 6.0, 6.0, "MI_TOS_Rock", folder=F)
        mid = along(PATH[i], PATH[i + 1], 0.5, 0, 2.4)
        point_light(b, "Passage_Light_%d" % i, mid[0], mid[1], mid[2], (0.3, 0.8, 0.75), 9000.0, 13.0, folder=F)
    # The water's surface across the shaft, where the hall meets the sea.
    b.box("Shaft_WaterSurface", 19.0, 27.0, -1.0, 6.0, SEA - 0.02, SEA, "MI_House_WaterSurface", F, collide=False)

    # Loose things floating in the way: they knock her aside, never stop her.
    def float_door(n, seg, k, right, up, rot):
        p = along(PATH[seg], PATH[seg + 1], k, right, up)
        obstacles.append(door_panel(b, "Float_Door_%d" % n, p, rot, F))

    def float_chair(n, seg, k, right, up, rot):
        p = along(PATH[seg], PATH[seg + 1], k, right, up)
        obstacles.append(chair(b, "Float_Chair_%d" % n, p[0], p[1], p[2] - 0.45, 0, F, rot=rot))

    def float_frame(n, seg, k, right, up, rot):
        p = along(PATH[seg], PATH[seg + 1], k, right, up)
        obstacles.append(picture(b, "Float_Picture_%d" % n, p, rot, 1.0, 0.8, F))

    float_door(0, 0, 0.75, 0.8, 0.3, (10, 60, 25))
    float_frame(0, 1, 0.45, -0.7, 0.5, (15, 30, -20))
    float_chair(0, 1, 0.85, 0.6, -0.4, (20, 140, 35))
    float_door(1, 4, 0.55, -0.8, 0.2, (40, 10, 70))
    float_chair(1, 5, 0.4, 0.7, 0.5, (-30, 80, 120))
    float_frame(1, 6, 0.3, -0.6, -0.6, (60, -40, 10))
    float_door(2, 6, 0.75, 0.7, 0.4, (-20, 120, -50))
    float_chair(2, 7, 0.5, -0.7, 0.3, (90, 30, 15))
    float_frame(2, 8, 0.45, 0.6, -0.5, (-15, 200, 40))
    # A bookcase drifting on its back, its books loose around it.
    p = along(PATH[5], PATH[6], 0.6, -0.5, -0.9)
    case = b.mesh(b.cube, V(*p), unreal.Vector(0.4, 1.4, 2.0), "MI_TOS_Wood", "Float_Bookcase", F, rot=(70, 20, 10))
    obstacles.append(case)
    for i in range(10):
        q = along(PATH[5], PATH[6], 0.45 + i * 0.03, rng.uniform(-2.2, 2.2), rng.uniform(-2.2, 2.2))
        b.mesh(b.cube, V(*q), unreal.Vector(0.16, 0.04, 0.24), "MI_TOS_Laundry_%d" % (i % 4), "Float_Book_%d" % i, F, rot=(rng.uniform(-90, 90), rng.uniform(0, 360), rng.uniform(-90, 90)), collide=False)
    # Seed-lights caught on the walls of the flooded part.
    for i in range(24):
        seg = 3 + i % (len(PATH) - 4)
        q = along(PATH[seg], PATH[seg + 1], rng.uniform(0.1, 0.9), rng.choice((-2.85, 2.85)), rng.uniform(-2.5, 2.5))
        b.mesh(b.sphere, V(*q), unreal.Vector(0.08, 0.08, 0.08), "MI_House_SeedGlow", "Wall_Seed_%d" % i, F, collide=False)

    ride = b.spawn(unreal.DescentRide, V(*PATH[0]), label="DescentRide", folder=F)
    path = ride.get_editor_property("path")
    path.clear_spline_points(True)
    for p in PATH:
        path.add_spline_point(V(*p), unreal.SplineCoordinateSpace.WORLD, True)
    ride.set_editor_property("obstacles", obstacles)
    ride.set_editor_property("radius", 140.0)
    # Where she goes under: the hall (2 segments), the fold, and a little way down the shaft.
    flooded = sum(frame_of(PATH[i], PATH[i + 1])[0] for i in range(3)) + 1.2
    ride.set_editor_property("flooded_from", flooded * 100.0)
    tow = tentacle(b, "Nacre_Tow", PATH[1], (0, 0, 0), base_radius=11.0, tip_radius=3.0, reach=700.0, tip_speed=900.0)
    ride.set_editor_property("tow", tow)
    log("descent: %d points, flooded from %.1f m, %d floating things" % (len(PATH), flooded, len(obstacles)))
    return ride


def build_conservatory(b):
    """The reveal: a drowned hall where houses hang like lanterns, each window on another sky."""
    F = "Conservatory"
    X0, X1, Y0, Y1, Z0, Z1 = 58, 102, 22, 70, -36, -4
    b.box("Cons_Floor", X0 - 1, X1 + 1, Y0 - 1, Y1 + 1, Z0 - 1, Z0, "MI_TOS_Rock", F)
    b.box("Cons_Ceiling", X0 - 1, X1 + 1, Y0 - 1, Y1 + 1, Z1, Z1 + 1, "MI_TOS_Rock", F)
    b.box("Cons_WallN", X1, X1 + 1, Y0, Y1, Z0, Z1, "MI_TOS_StoneDark", F)
    wall(b, "Cons_WallW", "y", X0 - 1, X0, Y0, Y1, Z0, Z1, "MI_TOS_StoneDark", [(27.0, 33.0, -23.0, -17.0)], folder=F)
    b.box("Cons_WallE", X0, X1, Y1, Y1 + 1, Z0, Z1, "MI_TOS_StoneDark", F)
    b.box("Cons_WallS", X0, X1, Y0 - 1, Y0, Z0, Z1, "MI_TOS_StoneDark", F)
    # She cannot swim back up the passage.
    hidden_wall(b, "Cons_Entry_Bound", X0 - 1.3, X0 - 1.0, 27.0, 33.0, -23.0, -17.0)
    # Rocks and old garden beds on the floor.
    for i in range(14):
        x, y = rng.uniform(X0 + 3, X1 - 3), rng.uniform(Y0 + 3, Y1 - 3)
        s = rng.uniform(1.5, 4.5)
        b.box("Cons_Rock_%d" % i, x - s / 2, x + s / 2, y - s / 2, y + s / 2, Z0, Z0 + s * 0.4, "MI_TOS_Rock", F)
    for i in range(30):
        x, y = rng.uniform(X0 + 2, X1 - 2), rng.uniform(Y0 + 2, Y1 - 2)
        h = rng.uniform(1.0, 4.0)
        b.mesh(b.cylinder, V(x, y, Z0 + h / 2), unreal.Vector(0.1, 0.1, h), "MI_House_SeedGlow" if i % 5 == 0 else "MI_TOS_Laundry_2", "Cons_Weed_%d" % i, F, rot=(rng.uniform(-8, 8), 0, rng.uniform(-8, 8)), collide=False)

    # Windows onto other skies: dawn and noon on the north wall, night on the east wall.
    def sky(label, cx, cy, cz, facing_x, top, low, extra):
        w, h = 9.0, 7.0
        if facing_x:
            b.box(label + "_Frame", X1 - 0.05, X1, cy - w / 2 - 0.3, cy + w / 2 + 0.3, cz - h / 2 - 0.3, cz + h / 2 + 0.3, "MI_TOS_Iron", F, collide=False)
            b.box(label + "_Top", X1 - 0.1, X1 - 0.05, cy - w / 2, cy + w / 2, cz, cz + h / 2, top, F, collide=False)
            b.box(label + "_Low", X1 - 0.1, X1 - 0.05, cy - w / 2, cy + w / 2, cz - h / 2, cz, low, F, collide=False)
            for i in range(3):
                b.box(label + "_Mullion_%d" % i, X1 - 0.15, X1 - 0.1, cy - w / 2 + (i + 1) * w / 4 - 0.08, cy - w / 2 + (i + 1) * w / 4 + 0.08, cz - h / 2, cz + h / 2, "MI_TOS_Iron", F, collide=False)
        else:
            b.box(label + "_Frame", cx - w / 2 - 0.3, cx + w / 2 + 0.3, Y1 - 0.05, Y1, cz - h / 2 - 0.3, cz + h / 2 + 0.3, "MI_TOS_Iron", F, collide=False)
            b.box(label + "_Top", cx - w / 2, cx + w / 2, Y1 - 0.1, Y1 - 0.05, cz, cz + h / 2, top, F, collide=False)
            b.box(label + "_Low", cx - w / 2, cx + w / 2, Y1 - 0.1, Y1 - 0.05, cz - h / 2, cz, low, F, collide=False)
            for i in range(3):
                b.box(label + "_Mullion_%d" % i, cx - w / 2 + (i + 1) * w / 4 - 0.08, cx - w / 2 + (i + 1) * w / 4 + 0.08, Y1 - 0.15, Y1 - 0.1, cz - h / 2, cz + h / 2, "MI_TOS_Iron", F, collide=False)
        extra()

    sky("Sky_Dawn", 0, 34, -16, True, "MI_House_SkyDawnTop", "MI_House_SkyDawnLow",
        lambda: b.mesh(b.sphere, V(X1 - 0.12, 35.5, -17.5), unreal.Vector(1.6, 1.6, 1.6), "MI_House_SkySun", "Sky_Dawn_Sun", F, collide=False))
    sky("Sky_Noon", 0, 56, -14, True, "MI_House_SkyNoonTop", "MI_House_SkyNoonLow",
        lambda: [b.mesh(b.sphere, V(X1 - 0.13, 56 + dy, -14 + dz), unreal.Vector(0.2, s, s * 0.45), "MI_House_SkyCloud", "Sky_Noon_Cloud_%d" % i, F, collide=False)
                 for i, (dy, dz, s) in enumerate(((-2.5, 1.5, 2.2), (1.0, 2.2, 1.6), (2.8, -0.5, 1.8)))])
    sky("Sky_Night", 82, 0, -15, False, "MI_House_SkyNightTop", "MI_House_SkyNightLow",
        lambda: [b.mesh(b.sphere, V(82 + rng.uniform(-4.2, 4.2), Y1 - 0.13, -15 + rng.uniform(-3.2, 3.2)), unreal.Vector(0.08, 0.08, 0.08), "MI_House_SkyStar", "Sky_Night_Star_%d" % i, F, collide=False)
                 for i in range(26)] + [b.mesh(b.sphere, V(84.5, Y1 - 0.14, -13.0), unreal.Vector(1.1, 1.1, 1.1), "MI_House_SkySun", "Sky_Night_Moon", F, collide=False)])
    # Each sky lights the water near it a little.
    point_light(b, "Sky_Dawn_Light", X1 - 4, 34, -16, (1.0, 0.6, 0.4), 9000.0, 22.0, folder=F)
    point_light(b, "Sky_Noon_Light", X1 - 4, 56, -14, (0.6, 0.8, 1.0), 8000.0, 22.0, folder=F)
    point_light(b, "Sky_Night_Light", 82, Y1 - 4, -15, (0.35, 0.45, 1.0), 6000.0, 20.0, folder=F)

    # Houses hanging like lanterns: a cottage each, windows lit, on a chain from the ceiling.
    largest = None
    for i, (x, y, z, s) in enumerate(((70, 52, -13, 1.0), (80, 30, -11, 0.9), (86, 50, -15, 1.7), (93, 62, -11, 1.0), (66, 64, -17, 0.8), (88, 26, -22, 1.1))):
        n = "Lantern_%d" % i
        lantern = b.box(n + "_Body", x - s, x + s, y - s, y + s, z - s, z + s * 0.6, "MI_TOS_Stone", F, collide=False)
        if s > 1.5:
            largest = lantern
        for k, half in enumerate((s * 1.1, s * 0.75, s * 0.4)):
            b.box("%s_Roof_%d" % (n, k), x - s * 1.1, x + s * 1.1, y - half, y + half, z + s * 0.6 + k * s * 0.3, z + s * 0.6 + (k + 1) * s * 0.3, "MI_TOS_StoneDark", F, collide=False)
        for k, (dx, dy) in enumerate(((s + 0.02, 0), (-s - 0.02, 0), (0, s + 0.02), (0, -s - 0.02))):
            wx, wy = x + dx, y + dy
            if dx:
                b.box("%s_Window_%d" % (n, k), wx - 0.02, wx + 0.02, wy - s * 0.35, wy + s * 0.35, z - s * 0.3, z + s * 0.25, "MI_House_LanternGlow", F, collide=False)
            else:
                b.box("%s_Window_%d" % (n, k), wx - s * 0.35, wx + s * 0.35, wy - 0.02, wy + 0.02, z - s * 0.3, z + s * 0.25, "MI_House_LanternGlow", F, collide=False)
        b.column(n + "_Chain", x, y, z + s * 1.5, Z1, 0.04, "MI_TOS_Iron", F)
        point_light(b, n + "_Light", x, y, z - s - 0.6, (1.0, 0.66, 0.38), 3500.0 * s, 9.0 * s, folder=F)
    point_light(b, "Cons_Fill", 80, 46, -12, (0.2, 0.6, 0.65), 6000.0, 40.0, folder=F)

    # Nacre: a great pale body low in the water, gold eyes with dark bars, arms about it.
    body = b.spawn(unreal.NacreMantle, V(*NACRE), label="Nacre_Body", folder="Nacre")
    body.set_editor_property("radius", NACRE_RADIUS * 100.0)
    to_her = [REVEAL_ENTRY[i] - NACRE[i] for i in range(3)]
    n = math.sqrt(sum(v * v for v in to_her))
    to_her = [v / n for v in to_her]
    side = (-to_her[1], to_her[0], 0.0)
    for k, sgn in ((0, -1), (1, 1)):
        e = [NACRE[i] + to_her[i] * NACRE_RADIUS * 0.68 + side[i] * sgn * 1.15 + (-0.1 if i == 2 else 0) for i in range(3)]
        eye = movable(b.mesh(b.sphere, V(*e), unreal.Vector(0.62, 0.62, 0.62), "MI_House_NacreEye", "Nacre_Eye_%d" % k, "Nacre", collide=False))
        pe = [e[i] + to_her[i] * 0.33 for i in range(3)]
        yaw = math.degrees(math.atan2(to_her[1], to_her[0]))
        pupil = movable(b.mesh(b.cube, V(*pe), unreal.Vector(0.1, 0.5, 0.14), "MI_House_Pupil", "Nacre_Pupil_%d" % k, "Nacre", rot=(0, yaw, 0), collide=False))
        for part in (eye, pupil):
            part.attach_to_actor(body, "", unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, False)
    # Arms resting about it, swaying; dark, like the body.
    arms = []
    for k in range(6):
        ang = math.radians(40 + k * 50)
        d = (math.cos(ang), math.sin(ang), -0.5)
        base = tuple(NACRE[i] + d[i] * NACRE_RADIUS * 0.75 for i in range(3))
        tip = (NACRE[0] + math.cos(ang) * 7.0, NACRE[1] + math.sin(ang) * 7.0, Z0 + 0.6 + (k % 3) * 1.2)
        arm = tentacle(b, "Nacre_Arm_%d" % k, base, rot_from_z(d), base_radius=30.0, tip_radius=5.0, reach=1100.0, segments=48, start_out=True, initial_tip=V(*tip),
                       silhouette=True, tip_speed=260.0)
        arms.append(arm)
        arm.attach_to_actor(body, "", unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, False)
    # The arm that holds out the gauge.
    base = tuple(NACRE[i] + to_her[i] * NACRE_RADIUS * 0.9 + (-0.9 if i == 2 else 0) for i in range(3))
    offer = tentacle(b, "Nacre_Offer", base, rot_from_z(to_her), base_radius=16.0, tip_radius=3.0, reach=1400.0, tip_speed=320.0)
    offer.attach_to_actor(body, "", unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, unreal.AttachmentRule.KEEP_WORLD, False)
    return body, offer, arms, largest


def build_story_tentacles(b):
    main = tentacle(b, "Nacre_Tentacle", SINK_DRAIN, (0, 0, 0), reach=800.0)
    burst = []
    for i, p in enumerate((FLOOR_DRAIN, SINK_DRAIN, (5.6, 1.2, 0.05))):
        burst.append(tentacle(b, "Nacre_Burst_%d" % i, p, (0, 0, 0), base_radius=10.0, tip_radius=2.5, reach=650.0))
    b.box("Floor_Crack", 5.3, 5.9, 1.05, 1.35, 0.04, 0.045, "MI_TOS_StoneDark", "Furniture", collide=False)
    return main, burst


def set_box(lo, hi):
    box = unreal.Box(V(*lo), V(*hi))
    box.set_editor_property("is_valid", True)
    return box


def build_weather(b):
    rain = b.spawn(unreal.StormRain, V(0, 0, 0), label="Rain", folder="World")
    # Dry under the roof and the hall, and below the sea.
    rain.set_editor_property("dry_boxes", [set_box((-3.3, -4.3, -1.0), (6.3, 4.3, 5.2)), set_box((6.2, -1.7, -1.0), (28.0, 6.7, 6.4)),
                                           set_box((-400, -400, -100), (400, 400, SEA))])
    seeds = b.spawn(unreal.StormRain, V(0, 0, 0), label="Seeds", folder="World")
    seeds.set_editor_property("count", 260)
    seeds.set_editor_property("extent", unreal.Vector(900, 900, 500))
    seeds.set_editor_property("velocity", unreal.Vector(18, 26, 34))
    seeds.set_editor_property("streak_scale", unreal.Vector(0.035, 0.035, 0.035))
    seeds.set_editor_property("material_path", HROOT + "/Materials/MI_House_Seed.MI_House_Seed")
    return rain, seeds


def build_underwater_post(b):
    pp = b.spawn(unreal.PostProcessVolume, V(60, 40, -20), label="UnderwaterGrade", folder="Lighting")
    pp.set_editor_property("unbound", True)
    pp.set_editor_property("priority", 2.0)
    pp.set_editor_property("blend_weight", 0.0)
    s = pp.get_editor_property("settings")
    for k, v in (("override_scene_color_tint", True), ("scene_color_tint", unreal.LinearColor(0.55, 0.88, 0.95, 1)),
                 ("override_vignette_intensity", True), ("vignette_intensity", 0.75),
                 ("override_bloom_intensity", True), ("bloom_intensity", 1.6),
                 ("override_auto_exposure_bias", True), ("auto_exposure_bias", 0.1)):
        try:
            s.set_editor_property(k, v)
        except Exception as e:
            log("underwater post %s: %s" % (k, e))
    pp.set_editor_property("settings", s)
    return pp


GRAB_LENGTH = 3.0


def grab_shot():
    gx, gy, gz = GRAB_SPOT
    yaw = math.radians(GRAB_YAW)
    head = (gx, gy, gz + 0.6)
    return [
        # Close on her face as the floor lets go...
        (0.0, (gx + math.cos(yaw) * 1.6, gy + math.sin(yaw) * 1.6, gz + 0.65), head),
        # ...back and wide as the arms come up from every drain...
        (1.2, (-1.6, -2.6, 2.6), (3.0, 0.8, 0.9)),
        # ...and round to the hall door as it bursts open and she is drawn through.
        (GRAB_LENGTH, (3.0, -0.6, 2.2), (6.5, 2.5, 1.4)),
    ]


def make_grab_cinematic(b):
    rate = 30
    name = "LS_House_Grab"
    sw.fresh("%s/Cinematics/%s" % (HROOT, name))
    keys = grab_shot()
    cam = b.eas.spawn_actor_from_class(unreal.CineCameraActor, V(*keys[0][1]), R())
    cam.set_actor_label("Cine_HouseGrab")
    cam.set_folder_path("Cinematics")
    cc = cam.get_cine_camera_component()
    cc.set_editor_property("current_focal_length", 22.0)
    focus = cc.get_editor_property("focus_settings")
    focus.set_editor_property("focus_method", unreal.CameraFocusMethod.DISABLE)
    cc.set_editor_property("focus_settings", focus)
    seq = AT.create_asset(name, HROOT + "/Cinematics", unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
    seq.set_display_rate(unreal.FrameRate(rate, 1))
    frames = int(round(GRAB_LENGTH * rate))
    seq.set_playback_start(0)
    seq.set_playback_end(frames)
    binding = seq.add_possessable(cam)
    section = binding.add_track(unreal.MovieScene3DTransformTrack).add_section()
    section.set_range(0, frames)
    channels = section.get_all_channels()
    last_yaw = None
    for t, pos, target in keys:
        d = (target[0] - pos[0], target[1] - pos[1], target[2] - pos[2])
        yaw = math.degrees(math.atan2(d[1], d[0]))
        if last_yaw is not None:
            while yaw - last_yaw > 180.0:
                yaw -= 360.0
            while yaw - last_yaw < -180.0:
                yaw += 360.0
        last_yaw = yaw
        pitch = math.degrees(math.atan2(d[2], math.hypot(d[0], d[1])))
        frame = unreal.FrameNumber(int(round(t * rate)))
        for i, v in enumerate((pos[0] * 100.0, pos[1] * 100.0, pos[2] * 100.0, 0.0, pitch, yaw)):
            channels[i].add_key(frame, v)
    cut = seq.add_track(unreal.MovieSceneCameraCutTrack).add_section()
    cut.set_range(0, frames)
    cut.set_camera_binding_id(seq.get_binding_id(binding))
    EAL.save_loaded_asset(seq, only_if_is_dirty=False)
    log("cinematic %s: %.1f s, %d keys" % (name, GRAB_LENGTH, len(keys)))


def build_level(M):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if EAL.does_asset_exist(MAP):
        EAL.delete_asset(MAP)
    if not les.new_level_from_template(MAP, sw.TEMPLATE):
        raise RuntimeError("could not create " + MAP)
    b = sw.Builder(M)
    for a in b.eas.get_all_level_actors():
        if isinstance(a, unreal.StaticMeshActor) and "floor" in a.get_actor_label().lower():
            b.eas.destroy_actor(a)
        elif isinstance(a, unreal.PlayerStart):
            b.eas.destroy_actor(a)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    world.get_world_settings().set_editor_property("default_game_mode", unreal.HouseGameMode)
    key = sw.setup_atmosphere(b)
    fog = None
    for a in b.eas.get_all_level_actors():
        if isinstance(a, unreal.ExponentialHeightFog):
            fog = a
            a.set_actor_location(V(0, 0, SEA - 0.5), False, False)
        elif isinstance(a, unreal.PostProcessVolume) and a.get_actor_label() == "StormGrade":
            # No motion blur: the tow moves fast past things close by, and steering needs them sharp.
            s = a.get_editor_property("settings")
            for k, v in (("override_motion_blur_amount", True), ("motion_blur_amount", 0.0)):
                s.set_editor_property(k, v)
            a.set_editor_property("settings", s)

    searchlight = build_exterior(b)
    build_cottage(b)
    rattles, lamps = build_furniture(b)
    gauge, details = build_details(b)
    hall_door, hinge, hall_lamps = build_hall(b)
    ride = build_descent(b)
    body, offer, arms, largest = build_conservatory(b)
    main, burst = build_story_tentacles(b)
    rain, seeds = build_weather(b)
    under = build_underwater_post(b)
    # Her reflection in the west windows' glass (its inner face is at y -4.12).
    mirror = b.spawn(unreal.HouseReflection, V(0, 0, 0), label="MaraReflection", folder="Story")
    mirror.set_editor_property("mirror_y", -412.0)

    d = b.spawn(unreal.HouseDirector, V(1.5, 0, 3.5), label="HouseDirector", folder="Story")
    for k, v in (("gauge", gauge), ("details", details), ("tentacle", main), ("burst", burst), ("offer", offer), ("nacre_body", body),
                 ("ride", ride), ("searchlight", searchlight), ("house_lamps", lamps + hall_lamps), ("rattles", rattles),
                 ("fog", fog), ("underwater", under), ("rain", rain), ("seeds", seeds), ("hall_door", hall_door),
                 ("hall_door_hinge", V(*hinge)), ("interior", set_box((-3.0, -4.0, -0.5), (6.0, 4.0, 3.2))),
                 ("sink_drain", V(*SINK_DRAIN)), ("floor_drain", V(*FLOOR_DRAIN)), ("teacup_spot", V(*TEACUP_SPOT)),
                 ("lamp_spot", V(*LAMP_SPOT)), ("grab_spot", V(*GRAB_SPOT)), ("grab_facing", R(yaw=GRAB_YAW)),
                 ("hall_start", V(*HALL_START)), ("reveal_entry", V(*REVEAL_ENTRY)), ("offer_spot", V(*OFFER_SPOT)),
                 ("reflection", mirror), ("reveal_look_at", largest), ("arms", arms), ("nacre_from", V(*NACRE_FROM)), ("nacre_to", V(*NACRE))):
        d.set_editor_property(k, v)
    if key:
        d.set_editor_property("storm_key", key)

    b.spawn(unreal.PlayerStart, V(-14.0, 0.0, 1.0), label="PlayerStart", folder="Story")
    for tag, x, y in (("WP_Door", -4.4, 0.0), ("WP_Inside", -1.8, 0.0), ("WP_Kettle", -1.0, 2.3), ("WP_Marks", 4.9, 1.0),
                      ("WP_Glass", 0.6, -2.4), ("WP_Bench", 1.8, 2.6), ("WP_Middle", 0.0, 0.2), ("WP_Teacup", 3.0, -1.0),
                      ("WP_Lamp", 1.0, -2.4)):
        b.waypoint(tag, x, y, 0.0)

    make_grab_cinematic(b)
    les.save_current_level()
    log("level: %d actors spawned, saved %s" % (b.count, MAP))


def main():
    with open(LOG, "w", encoding="utf-8") as f:
        f.write("")
    log("project %s" % PROJECT_DIR)
    try:
        import_house_sounds()
        M = make_materials()
        EAL.save_directory(HROOT, only_if_is_dirty=False, recursive=True)
        build_level(M)
        EAL.save_directory(HROOT, only_if_is_dirty=True, recursive=True)
        log("DONE")
    except Exception:
        log("ERROR\n" + traceback.format_exc())


main()
