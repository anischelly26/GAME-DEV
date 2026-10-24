"""
Builds It Takes One's worlds inside an Unreal Engine 5 project. Headless (no window, no GPU):

    UnrealEditor-Cmd.exe <Project>.uproject -run=pythonscript -script="<this file>" -nullrhi -unattended

or, with the project open: Tools > Execute Python Script... and pick this file (the editor is
busy until it finishes).

It expects the exports from `scripts/export-unreal.mjs` in an `Import` folder next to the project
folder (../Import relative to the .uproject's folder). For each chapter it creates a level from
the engine's Basic template (sun, sky, fog), removes the template's floor, imports the chapter's
.glb into it (Interchange scene import: meshes, materials, textures and lights placed as in the
game), makes the meshes walkable (complex collision as simple; the sea is not solid), puts a
Player Start at a chapter checkpoint aimed the way Mara faces there, and saves. Then it imports
Mara (skeletal mesh and her 29 animations) as assets. Everything runs in order: each import is
waited for before the next step. Progress goes to the log and to Saved/ItTakesOne_import.log.

The project's own game mode decides who walks (the Third Person template's character).
"""
import gc
import math
import os
import time
import traceback

import unreal

PROJECT_DIR = os.path.abspath(unreal.Paths.project_dir())
IMPORT_DIR = os.path.abspath(os.path.join(PROJECT_DIR, os.pardir, "Import"))
LOG_PATH = os.path.join(PROJECT_DIR, "Saved", "ItTakesOne_import.log")
ROOT = "/Game/ItTakesOne"
TEMPLATE = "/Engine/Maps/Templates/Template_Default"

# Chapter file, and the checkpoint the Player Start goes to (one with a view and a way out).
LEVELS = [
    ("MovementLab", "start"),
    ("Chapter2_TheWardersGreen", "cove"),
    ("Chapter3_TheLowTide", "slipway"),
    ("Chapter1_TheQuietCell", "lookout"),
]

STARTED = time.time()


def log(msg):
    line = "[ItTakesOne] %s %s" % (time.strftime("%H:%M:%S"), msg)
    unreal.log(line)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def actor_subsystem():
    return unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def label(actor):
    return actor.get_actor_label() or ""


def collect():
    gc.collect()
    unreal.SystemLibrary.collect_garbage()


def build_level(name, start_id):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    path = "%s/Maps/%s" % (ROOT, name)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        log("%s: level exists, replacing it" % name)
        unreal.EditorAssetLibrary.delete_asset(path)
    if not les.new_level_from_template(path, TEMPLATE):
        raise RuntimeError("could not create level " + path)

    # The template's floor would cut through the chapter.
    for a in actor_subsystem().get_all_level_actors():
        if isinstance(a, unreal.StaticMeshActor) and "floor" in label(a).lower():
            actor_subsystem().destroy_actor(a)
    before = set(a.get_path_name() for a in actor_subsystem().get_all_level_actors())

    log("%s: importing" % name)
    source = unreal.InterchangeManager.create_source_data(os.path.join(IMPORT_DIR, name + ".glb"))
    params = unreal.ImportAssetParameters()
    params.is_automated = True
    params.import_level = les.get_current_level()
    if not manager.import_scene("%s/%s" % (ROOT, name), source, params):
        raise RuntimeError("import_scene refused " + name)
    manager.wait_until_all_tasks_done(False)
    log("%s: imported" % name)

    imported = [x for x in actor_subsystem().get_all_level_actors() if x.get_path_name() not in before]
    marks = {}
    for x in imported:
        l = label(x)
        if l.startswith("Checkpoint_") or l.startswith("Aim_"):
            marks[l] = x

    # Interchange should convert metres to centimetres; check with a known 1 m and fix if not.
    pairs = [(l, "Aim_" + l[len("Checkpoint_"):]) for l in marks if l.startswith("Checkpoint_")]
    pairs = [(c, a) for c, a in pairs if a in marks]
    if pairs:
        c, a = pairs[0]
        d = (marks[a].get_actor_location() - marks[c].get_actor_location()).length()
        log("%s: 1 m in the game is %.2f units here (should be 100)" % (name, d))
        if 0 < d < 10:
            scale = 100.0 / d
            log("%s: scaling the imported scene by %.1f" % (name, scale))
            for x in imported:
                if x.get_attach_parent_actor() is None:
                    x.set_actor_location(x.get_actor_location() * scale, False, False)
                    x.set_actor_scale3d(x.get_actor_scale3d() * scale)
    else:
        log("%s: WARNING no checkpoint markers found among %d imported actors" % (name, len(imported)))

    meshes = solid = sea = 0
    done_assets = set()
    for x in imported:
        l = label(x)
        if isinstance(x, unreal.DirectionalLight):
            # The template's sun, sky and fog light the level instead.
            actor_subsystem().destroy_actor(x)
            continue
        if l.startswith("Checkpoint_") or l.startswith("Aim_"):
            x.set_actor_hidden_in_game(True)
            x.set_folder_path("Checkpoints")
            continue
        if not isinstance(x, unreal.StaticMeshActor):
            continue
        comp = x.static_mesh_component
        mesh = comp.static_mesh
        meshes += 1
        mats = [m.get_name() for m in comp.get_materials() if m]
        if any("sea" in m.lower() for m in mats):
            comp.set_collision_profile_name("NoCollision")
            sea += 1
            continue
        if mesh and mesh.get_path_name() not in done_assets:
            done_assets.add(mesh.get_path_name())
            body = mesh.get_editor_property("body_setup")
            if body:
                body.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
                unreal.EditorAssetLibrary.save_loaded_asset(mesh, False)
                solid += 1

    # A Player Start at the chosen checkpoint, facing the way Mara faces there.
    for x in actor_subsystem().get_all_level_actors():
        if isinstance(x, unreal.PlayerStart):
            actor_subsystem().destroy_actor(x)
    c = next((m for l, m in marks.items() if l.startswith("Checkpoint_") and l.endswith("_" + start_id)), None)
    a = next((m for l, m in marks.items() if l.startswith("Aim_") and l.endswith("_" + start_id)), None)
    if c and a:
        p = c.get_actor_location()
        q = a.get_actor_location()
        yaw = math.degrees(math.atan2(q.y - p.y, q.x - p.x))
        actor_subsystem().spawn_actor_from_class(unreal.PlayerStart, p + unreal.Vector(0, 0, 100), unreal.Rotator(0, 0, yaw))
        log("%s: Player Start at (%.0f, %.0f, %.0f), checkpoint '%s', yaw %.0f" % (name, p.x, p.y, p.z, start_id, yaw))
    else:
        log("%s: WARNING no checkpoint '%s'; place a Player Start by hand" % (name, start_id))

    les.save_current_level()
    unreal.EditorAssetLibrary.save_directory("%s/%s" % (ROOT, name), only_if_is_dirty=True, recursive=True)
    log("%s: saved: %d actors imported, %d mesh actors, %d meshes made walkable, %d sea surfaces not solid" % (name, len(imported), meshes, solid, sea))


def import_mara():
    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", os.path.join(IMPORT_DIR, "Mara.glb"))
    task.set_editor_property("destination_path", ROOT + "/Mara")
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("save", True)
    log("Mara: importing (skeletal mesh and animations)")
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    manager.wait_until_all_tasks_done(False)
    unreal.EditorAssetLibrary.save_directory(ROOT + "/Mara", only_if_is_dirty=True, recursive=True)
    names = unreal.EditorAssetLibrary.list_assets(ROOT + "/Mara", recursive=True)
    log("Mara: %d assets" % len(names))


def main():
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        f.write("")
    log("project %s, imports from %s" % (PROJECT_DIR, IMPORT_DIR))
    missing = [n for n, _ in LEVELS if not os.path.exists(os.path.join(IMPORT_DIR, n + ".glb"))]
    if missing:
        log("ERROR missing exports: %s" % ", ".join(missing))
        return
    ok = True
    for name, start_id in LEVELS:
        try:
            build_level(name, start_id)
        except Exception:
            ok = False
            log("ERROR in %s\n%s" % (name, traceback.format_exc()))
        collect()
    try:
        import_mara()
    except Exception:
        ok = False
        log("ERROR in Mara\n" + traceback.format_exc())
    log("%s after %.0f s" % ("DONE" if ok else "FINISHED WITH ERRORS", time.time() - STARTED))


main()
