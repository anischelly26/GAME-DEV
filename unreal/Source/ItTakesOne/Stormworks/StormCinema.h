#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "StormCinema.generated.h"

class ALevelSequenceActor;
class UAudioComponent;
class ULevelSequencePlayer;

UENUM(BlueprintType)
enum class EStormShot : uint8
{
	/** The lighthouse through the storm, then in through the window to Mara. */
	Opening,
	/** The storm engine wakes: the sluice gate grinds open, the catwalk beyond. */
	EngineReveal,
	/** The signal tower's roof: the lighthouse ahead, Ivo's hut. */
	Rooftop,
	Count UMETA(Hidden),
};

UENUM(BlueprintType)
enum class EShotEnd : uint8
{
	Completed,
	Skipped,
	/** Restart, a respawn or leaving the map: nothing is granted. */
	Cancelled,
};

/**
 * The three short cinematics (Level Sequences LS_SW_Opening, LS_SW_EngineReveal, LS_SW_Rooftop,
 * made by build_stormworks.py) and the one rule for ending them. Natural completion, a skip and a
 * cancellation all go through FinishSequenceOnce, which runs once per play:
 *
 * - it restores the gameplay camera (a short blend), the player's input and the HUD, and ends the
 *   shot's own audio;
 * - after a completion or a skip, and only the first time the shot is seen, it applies the shot's
 *   progression (OnProgress: the game mode sets the objective and the music);
 * - after a cancellation it grants nothing.
 *
 * Shots only start where she is standing still (the start, after pulling the coupling, on the
 * roof): the camera is never taken during precision movement. Sequencer events are not relied on.
 */
UCLASS(ClassGroup = (ItTakesOne))
class ITTAKESONE_API UStormCinema : public UActorComponent
{
	GENERATED_BODY()

public:
	UStormCinema();

	/** Plays a shot. A shot already seen plays again only with bReplay (and grants nothing then). */
	bool Play(EStormShot Shot, bool bReplay = false);

	/** The player's skip: jump to the end, keep what the shot grants. */
	void Skip();

	/** A restart, a respawn or leaving the map during a shot: restore, grant nothing. */
	void Cancel();

	bool IsPlaying() const { return Current >= 0; }
	bool IsPlaying(EStormShot Shot) const { return Current == static_cast<int32>(Shot); }
	float GetTime() const;
	float GetLength() const;

	DECLARE_MULTICAST_DELEGATE_OneParam(FOnProgress, EStormShot);
	/** The shot's progression, once per shot: completion or skip, never on cancellation. */
	FOnProgress OnProgress;

	// Read by the self-test.
	int32 Granted[static_cast<int32>(EStormShot::Count)] = {};
	bool Seen[static_cast<int32>(EStormShot::Count)] = {};
	EShotEnd LastEnd = EShotEnd::Completed;
	int32 Finishes = 0;

	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	void FinishSequenceOnce(EStormShot Shot, EShotEnd Reason);

	UFUNCTION()
	void OnPlayerFinished();

	UPROPERTY(Transient)
	TObjectPtr<ULevelSequencePlayer> Player;

	UPROPERTY(Transient)
	TObjectPtr<ALevelSequenceActor> SequenceActor;

	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> Stinger;

	int32 Current = -1;
	bool bReplaying = false;
	bool bInputTaken = false;
};
