#pragma once

#include "CoreMinimal.h"

class UMaterialInterface;
class UStaticMesh;

/**
 * Where The Stormworks Escape finds its assets. The level builder (tools/unreal/build_stormworks.py)
 * creates the materials and imports the sounds at these paths; code only loads them by name, so a
 * missing asset degrades to the engine's defaults (and a silent sound) instead of a crash.
 */
namespace Stormworks
{
	/** An engine basic shape: Cube, Cylinder, Sphere, Plane, Cone (all 100 cm). */
	ITTAKESONE_API UStaticMesh* Mesh(const TCHAR* Name);

	/** /Game/ItTakesOne/Stormworks/Materials/<Name>, or the engine's basic material. */
	ITTAKESONE_API UMaterialInterface* Material(const TCHAR* Name);

	/** /Game/ItTakesOne/Stormworks/Audio/<Name> at a place in the world. */
	ITTAKESONE_API void Sound(const UObject* WorldContext, const TCHAR* Name, const FVector& Location, float Volume = 1.f, float Pitch = 1.f);

	/** The same, not positioned (alarms, thunder, interface). */
	ITTAKESONE_API void Sound2D(const UObject* WorldContext, const TCHAR* Name, float Volume = 1.f, float Pitch = 1.f);

	/** The accent colour of everything the tether can use. */
	inline FLinearColor Accent() { return FLinearColor(0.10f, 0.85f, 0.75f); }
}
