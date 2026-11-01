#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "HouseGameMode.generated.h"

class AHouseDirector;
class UInputAction;
class UInputMappingContext;
class UStormCinema;
enum class EStormShot : uint8;

/**
 * The house under Knoll Rock (the first slice of docs/STORY_HOUSE_AND_NACRE.md): Mara, her E and
 * skip buttons, the words on screen, the cinematic, the end. What happens in the house is
 * AHouseDirector's, placed in the level. With -HouseSelfTest it spawns the house's bot.
 */
UCLASS()
class ITTAKESONE_API AHouseGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AHouseGameMode();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "House")
	TObjectPtr<UStormCinema> Cinema;

	/** Holds the level behind a title card until it is ready to be seen. */
	UPROPERTY(Transient)
	TObjectPtr<class AReadyGate> Gate;

	// What the HUD shows.
	FString Objective;
	FString Message;
	float MessageLeft = 0.f;
	/** A hint at the bottom of the screen, set every frame by the director (empty: none). */
	FString Prompt;
	bool bComplete = false;
	/** 0..1, a fade to black. */
	float Fade = 0.f;

	void SetObjective(const FString& Text);
	void ShowMessage(const FString& Text, float Seconds = 3.f);
	void Complete();
	AHouseDirector* GetDirector() const;

	virtual void StartPlay() override;
	virtual void RestartPlayer(AController* NewPlayer) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void BindInput(APlayerController* PC);
	void OnInteract();
	void OnSkip();
	void OnShotProgress(EStormShot Shot);

	UPROPERTY(Transient)
	TObjectPtr<UInputMappingContext> Mapping;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> InteractAction;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> SkipAction;

	mutable TWeakObjectPtr<AHouseDirector> Director;
};
