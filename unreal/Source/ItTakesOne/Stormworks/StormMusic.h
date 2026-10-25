#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "StormMusic.generated.h"

class UAudioComponent;

UENUM(BlueprintType)
enum class EStormMood : uint8
{
	Silence,
	/** Ivo's workshop: warm curiosity. */
	Workshop,
	/** The seawall gallery: light forward motion. */
	Gallery,
	/** The coupling pulled, the engine waking: the music drops away for the reveal. */
	Anticipation,
	/** The catwalk: the escape. */
	Escape,
	/** The tower roof: relief. */
	Rooftop,
};

/**
 * The sequence's music, following meaningful gameplay events only (never guesses from frame to
 * frame): the game mode calls SetMood at the start, the gallery checkpoint, the coupling, the end of
 * the engine reveal and the roof. Two owned audio components cross-fade between the mood's tracks;
 * a respawn only ducks the music for a moment rather than restarting it. Tracks are the web game's
 * CC0 music (docs/ASSETS.md), imported as MUS_* by build_stormworks.py. No beat-synced scheduling:
 * the tracks do not share tempo or loop points, so plain cross-fades are used.
 */
UCLASS(ClassGroup = (ItTakesOne))
class ITTAKESONE_API UStormMusic : public UActorComponent
{
	GENERATED_BODY()

public:
	UStormMusic();

	void SetMood(EStormMood Mood);
	/** A respawn: dip for a moment, carry on. */
	void Duck();

	EStormMood GetMood() const { return Mood; }
	/** The track playing now (for the self-test and the log). */
	FName GetTrack() const { return Track; }
	int32 Changes = 0;
	int32 Ducks = 0;
	/** Audio components this component has created (they are reused: never more than two). */
	int32 Voices() const;

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> A;

	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> B;

	EStormMood Mood = EStormMood::Silence;
	FName Track = NAME_None;
	float DuckLeft = 0.f;
};
