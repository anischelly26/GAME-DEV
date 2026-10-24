"""
Makes the imported Mara (import_it_takes_one.py, /Game/ItTakesOne/Mara) usable as a playable
character. Headless, with the editor closed:

    UnrealEditor-Cmd.exe <Project>.uproject -run=pythonscript -script="<repo>/tools/unreal/prepare_mara.py" -nullrhi -unattended

Two fixes, both found in the game (docs/UNREAL_STORMWORKS.md):

1. Her materials are instances of Interchange's glTF master (/InterchangeAssets/gltf/.../M_GLTF),
   which is not flagged "Used with Skeletal Mesh". The editor would set the flag on the fly, a game
   cannot, so she rendered with the engine's default checker material. The master is copied into
   the project with the flag set, and her material instances are re-parented to the copy.
2. Her rigid parts (eyes, lids, brows, mouth, the scarf's knot, the kit on her back) are glTF meshes
   parented to bones, so Interchange imports them as separate static meshes, unplaced. Each is
   renamed MaraPart_<bone>_<node> from the hierarchy in Mara.glb, so the game can attach it to that
   bone (UMaraAnimInstance::Dress).

Run it again after re-importing Mara.glb. Log: Saved/Mara_prepare.log.
"""
import json
import os
import struct

import unreal

PROJECT_DIR = os.path.abspath(unreal.Paths.project_dir())
GLB = os.path.abspath(os.path.join(PROJECT_DIR, os.pardir, "Import", "Mara.glb"))
LOG = os.path.join(PROJECT_DIR, "Saved", "Mara_prepare.log")
MARA = "/Game/ItTakesOne/Mara"
MASTER = MARA + "/Materials/M_MaraGLTF"

EAL = unreal.EditorAssetLibrary
MEL = unreal.MaterialEditingLibrary


def log(msg):
    unreal.log("[Mara] " + msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def glb_part_bones():
    """glTF node index -> the bone (joint) it hangs from, for meshes that are not skinned."""
    data = open(GLB, "rb").read()
    length = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + length])
    nodes = gltf["nodes"]
    parent = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i
    joints = set(gltf["skins"][0]["joints"])
    out = {}
    for i, node in enumerate(nodes):
        if "mesh" not in node or "skin" in node:
            continue
        p = parent.get(i)
        while p is not None and p not in joints:
            p = parent.get(p)
        if p is not None:
            out[i] = nodes[p].get("name", "joint%d" % p).lower()
    return out


def fix_master():
    instances = [unreal.load_asset(p) for p in EAL.list_assets(MARA, recursive=True, include_folder=False)]
    instances = [m for m in instances if isinstance(m, unreal.MaterialInstanceConstant)]
    if not instances:
        log("no material instances under %s" % MARA)
        return
    source = instances[0].get_editor_property("parent")
    while isinstance(source, unreal.MaterialInstance):
        source = source.get_editor_property("parent")
    if source.get_path_name().startswith(MASTER):
        log("materials already use %s" % MASTER)
        return
    if not EAL.does_asset_exist(MASTER):
        EAL.duplicate_asset(source.get_path_name().split(".")[0], MASTER)
    master = unreal.load_asset(MASTER)
    master.set_editor_property("used_with_skeletal_mesh", True)
    MEL.recompile_material(master)
    EAL.save_loaded_asset(master)
    for mi in instances:
        if mi.get_editor_property("parent") == source:
            MEL.set_material_instance_parent(mi, master)
            MEL.update_material_instance(mi)
            # Re-parenting does not mark the package dirty: save regardless.
            EAL.save_loaded_asset(mi, only_if_is_dirty=False)
    log("%d material instances re-parented from %s to %s (Used with Skeletal Mesh)" % (len(instances), source.get_path_name(), MASTER))


def name_parts():
    bones = glb_part_bones()
    renamed = 0
    for path in EAL.list_assets(MARA, recursive=True, include_folder=False):
        asset = unreal.load_asset(path)
        if not isinstance(asset, unreal.StaticMesh):
            continue
        name = asset.get_name()
        if not name.startswith("Mara_node_"):
            continue
        index = int(name[len("Mara_node_"):])
        bone = bones.get(index)
        if not bone:
            log("no bone for %s" % name)
            continue
        folder = path.rsplit("/", 1)[0]
        new = "%s/MaraPart_%s_%d" % (folder, bone, index)
        if EAL.rename_asset(path.split(".")[0], new):
            renamed += 1
    log("%d rigid parts named after their bones" % renamed)


if os.path.exists(LOG):
    os.remove(LOG)
fix_master()
name_parts()
log("DONE")
