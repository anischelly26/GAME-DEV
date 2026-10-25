#include "Stormworks/StormworksAssets.h"

#include "Engine/StaticMesh.h"
#include "Components/AudioComponent.h"
#include "Components/SceneComponent.h"
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

USoundBase* Stormworks::SoundAsset(const TCHAR* Name)
{
	static TMap<FString, TWeakObjectPtr<USoundBase>> Cache;
	return LoadCached(Cache, FString::Printf(TEXT("/Game/ItTakesOne/Stormworks/Audio/%s.%s"), Name, Name));
}

void Stormworks::Sound(const UObject* WorldContext, const TCHAR* Name, const FVector& Location, float Volume, float Pitch)
{
	if (USoundBase* S = SoundAsset(Name))
	{
		UGameplayStatics::PlaySoundAtLocation(WorldContext, S, Location, Volume, Pitch);
	}
}

void Stormworks::Sound2D(const UObject* WorldContext, const TCHAR* Name, float Volume, float Pitch)
{
	if (USoundBase* S = SoundAsset(Name))
	{
		UGameplayStatics::PlaySound2D(WorldContext, S, Volume, Pitch);
	}
}

UAudioComponent* Stormworks::SoundAttached(USceneComponent* To, const TCHAR* Name, float Volume, float Pitch)
{
	USoundBase* S = To ? SoundAsset(Name) : nullptr;
	return S ? UGameplayStatics::SpawnSoundAttached(S, To, NAME_None, FVector::ZeroVector, EAttachLocation::KeepRelativeOffset, true, Volume, Pitch) : nullptr;
}

int32 Stormworks::Variant(int32 Count, int32 Last)
{
	if (Count <= 1)
	{
		return 0;
	}
	if (Last < 0 || Last >= Count)
	{
		return FMath::RandRange(0, Count - 1);
	}
	const int32 Pick = FMath::RandRange(0, Count - 2);
	return Pick >= Last ? Pick + 1 : Pick;
}
