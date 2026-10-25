#include "Stormworks/StormMusic.h"

#include "Components/AudioComponent.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "Stormworks/StormworksAssets.h"

namespace
{
	constexpr float MusicVolume = 0.32f;
	constexpr float FadeSeconds = 2.0f;

	/** Each mood's track (none: silence). Chosen by the tracks' descriptions; nobody has listened
	 *  to them in this scene yet (docs/UNREAL_STORMWORKS.md). */
	const TCHAR* TrackFor(EStormMood Mood)
	{
		switch (Mood)
		{
		case EStormMood::Workshop: return TEXT("MUS_QuietPiano");
		case EStormMood::Gallery: return TEXT("MUS_SailorsChant");
		case EStormMood::Escape: return TEXT("MUS_TreasureHunter");
		case EStormMood::Rooftop: return TEXT("MUS_RisingMoon");
		default: return nullptr;
		}
	}
}

UStormMusic::UStormMusic()
{
	PrimaryComponentTick.bCanEverTick = true;
}

int32 UStormMusic::Voices() const
{
	return (A ? 1 : 0) + (B ? 1 : 0);
}

void UStormMusic::SetMood(EStormMood NewMood)
{
	if (NewMood == Mood)
	{
		return;
	}
	Mood = NewMood;
	++Changes;
	const TCHAR* Name = TrackFor(NewMood);
	// The outgoing track fades; the incoming one fades in on the other voice.
	if (A && A->IsPlaying())
	{
		A->FadeOut(NewMood == EStormMood::Anticipation ? 1.0f : FadeSeconds, 0.f);
	}
	Swap(A, B);
	Track = Name ? FName(Name) : NAME_None;
	UE_LOG(LogStormworks, Log, TEXT("Music: %s"), Name ? Name : TEXT("silence"));
	USoundBase* S = Name ? Stormworks::SoundAsset(Name) : nullptr;
	if (!S)
	{
		return;
	}
	if (!A)
	{
		// One of two voices, owned and reused for the whole session.
		A = UGameplayStatics::CreateSound2D(this, S, MusicVolume, 1.f, 0.f, nullptr, true, false);
	}
	if (A)
	{
		A->SetSound(S);
		A->SetVolumeMultiplier(MusicVolume);
		// Fade levels multiply the component's own volume (MusicVolume): 1 is "full".
		A->FadeIn(FadeSeconds, 1.f);
	}
}

void UStormMusic::Duck()
{
	++Ducks;
	DuckLeft = 1.2f;
	if (A && A->IsPlaying())
	{
		A->AdjustVolume(0.25f, 0.35f);
	}
}

void UStormMusic::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (DuckLeft > 0.f)
	{
		DuckLeft -= DeltaTime;
		if (DuckLeft <= 0.f && A && A->IsPlaying())
		{
			A->AdjustVolume(1.0f, 1.f);
		}
	}
}

void UStormMusic::EndPlay(const EEndPlayReason::Type Reason)
{
	for (UAudioComponent* V : {A.Get(), B.Get()})
	{
		if (V)
		{
			V->Stop();
		}
	}
	Super::EndPlay(Reason);
}
