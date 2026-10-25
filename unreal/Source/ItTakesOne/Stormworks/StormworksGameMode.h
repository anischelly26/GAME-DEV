#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "StormworksGameMode.generated.h"

class ACharacter;
class AStormCheckpoint;
class AStormDirector;
class AStoryNote;
class UStormCinema;
class UStormMusic;
class UTetherComponent;
enum class EStormShot : uint8;

/**
 * The Stormworks Escape's rules: who plays (the project's Third Person character, given Ivo's
 * tether component), the current objective, checkpoints that only move forward, recovery from a
 * fall (back to the checkpoint in a moment, nothing solved is undone), reading notes, and the
 * end of the sequence. `-StormSelfTest` on the command line starts the scripted self-test.
 */
UCLASS()
class ITTAKESONE_API AStormworksGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AStormworksGameMode();

	virtual void StartPlay() override;
	virtual void RestartPlayer(AController* NewPlayer) override;
	virtual void Tick(float DeltaSeconds) override;

	/** Falling below this height (cm) is a fall into the sea. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stormworks")
	float FallZ = -700.f;

	UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category = "Stormworks")
	FString Objective;

	UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category = "Stormworks")
	TObjectPtr<AStormCheckpoint> Checkpoint;

	UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category = "Stormworks")
	TObjectPtr<AStoryNote> OpenNote;

	FString Message;
	float MessageLeft = 0.f;
	float MessageDuration = 1.f;
	/** 1 just after a respawn, fading to 0 (the HUD draws it). */
	float Fade = 0.f;
	int32 Falls = 0;
	int32 Respawns = 0;
	bool bComplete = false;
	float StartTime = 0.f;
	float CompleteTime = 0.f;

	/** The three cinematics and their one finishing rule. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Stormworks")
	TObjectPtr<UStormCinema> Cinema;

	/** The music, following the sequence's moods. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Stormworks")
	TObjectPtr<UStormMusic> Music;

	void SetObjective(const FString& Text);
	void ShowMessage(const FString& Text, float Seconds = 2.6f);

	void ReachCheckpoint(AStormCheckpoint* Point);

	/** Back to the current checkpoint (a fall, or the player asked). */
	void Respawn(bool bFell);

	/** Restart from the last checkpoint (R, or `StormRestart` in the console). */
	UFUNCTION(Exec, BlueprintCallable, Category = "Stormworks")
	void StormRestart();

	/** Interact (read a note in front of her, or close the open one). True if used. */
	bool TryInteract(ACharacter* Who);
	AStoryNote* NoteInReach(const ACharacter* Who) const;
	/** Ivo's toy, if she is close to it and facing it. */
	class AWorkshopToy* ToyInReach(const ACharacter* Who) const;
	void CloseNote();

	void Complete();

	ACharacter* GetPlayerCharacter() const;
	UTetherComponent* GetTether() const;
	AStormDirector* GetDirector() const;

private:
	UPROPERTY(Transient)
	TArray<TObjectPtr<UObject>> Preloaded;

	bool bOpeningPending = false;
	void OnShotProgress(EStormShot Shot);
};
