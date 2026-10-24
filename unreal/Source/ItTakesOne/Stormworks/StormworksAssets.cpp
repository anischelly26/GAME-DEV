#include "Stormworks/StormworksAssets.h"

#include "Engine/StaticMesh.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInterface.h"
#include "Sound/SoundBase.h"

namespace
{
	template <typename T>
	T* LoadCached(TMap<FString, TWeakObjectPtr<T>>& Cache, const FString& Path)
	{
		if (TWeakObjectPtr<T>* Found = Cache.Find(Path))
		{
			if (Found->IsValid())
			{
				return Found->Get();
			}
		}
		T* Loaded = LoadObject<T>(nullptr, *Path, nullptr, LOAD_NoWarn | LOAD_Quiet);
		Cache.Add(Path, Loaded);
		return Loaded;
	}
}

UStaticMesh* Stormworks::Mesh(const TCHAR* Name)
{
	static TMap<FString, TWeakObjectPtr<UStaticMesh>> Cache;
	return LoadCached(Cache, FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Name, Name));
}

UMaterialInterface* Stormworks::Material(const TCHAR* Name)
{
	static TMap<FString, TWeakObjectPtr<UMaterialInterface>> Cache;
	if (UMaterialInterface* M = LoadCached(Cache, FString::Printf(TEXT("/Game/ItTakesOne/Stormworks/Materials/%s.%s"), Name, Name)))
	{
		return M;
	}
	return LoadCached(Cache, FString(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")));
}

void Stormworks::Sound(const UObject* WorldContext, const TCHAR* Name, const FVector& Location, float Volume, float Pitch)
{
	static TMap<FString, TWeakObjectPtr<USoundBase>> Cache;
	if (USoundBase* S = LoadCached(Cache, FString::Printf(TEXT("/Game/ItTakesOne/Stormworks/Audio/%s.%s"), Name, Name)))
	{
		UGameplayStatics::PlaySoundAtLocation(WorldContext, S, Location, Volume, Pitch);
	}
}

void Stormworks::Sound2D(const UObject* WorldContext, const TCHAR* Name, float Volume, float Pitch)
{
	static TMap<FString, TWeakObjectPtr<USoundBase>> Cache;
	if (USoundBase* S = LoadCached(Cache, FString::Printf(TEXT("/Game/ItTakesOne/Stormworks/Audio/%s.%s"), Name, Name)))
	{
		UGameplayStatics::PlaySound2D(WorldContext, S, Volume, Pitch);
	}
}
