#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StormDirector.generated.h"

class ACollapsingWalkway;
class ADirectionalLight;
class ALight;
class AStormCheckpoint;
class ATetherMovable;
class UAudioComponent;

/**
 * The storm and the one thing that changes the situation. Lightning flickers over the sea every
 * so often (the key light flashes, thunder follows). When Mara engages the storm coupling, the
 * prison's storm engine comes on: the sluice gate grinds open, alarm lamps flash red, the storm
 * gets louder, and the old catwalk beyond the gate is armed to collapse under her.
 */
UCLASS()
class ITTAKESONE_API AStormDirector : public AActor
{
	GENERATED_BODY()

public:
	AStormDirector();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Storm")
	TObjectPtr<ATetherMovable> Coupling;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Storm")
	TObjectPtr<ATetherMovable> Gate;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Storm")
	TObjectPtr<ACollapsingWalkway> Walkway;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Storm")
	TArray<TObjectPtr<ALight>> AlarmLamps;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Storm")
	TObjectPtr<ADirectionalLight> StormLight;

	/** From this checkpoint on, a respawn resets the catwalk. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Storm")
	int32 ClimaxCheckpointOrder = 4;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Storm")
	FString EngagedObjective = TEXT("Cross the old catwalk to the signal tower");

	UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category = "Storm")
	bool bEngaged = false;

	int32 Flashes = 0;

	void Engage();
	void OnRespawn(AStormCheckpoint* Checkpoint);
	void Flash(float Strength = 1.f);

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void OnCouplingArrived(ATetherMovable* M);

	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> Wind;

	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> Alarm;

	float Time = 0.f;
	float NextFlash = 6.f;
	float FlashT = -1.f;
	float FlashStrength = 1.f;
	float ThunderIn = -1.f;
	float BaseLightIntensity = 0.f;
	float EngagedT = 0.f;
};
