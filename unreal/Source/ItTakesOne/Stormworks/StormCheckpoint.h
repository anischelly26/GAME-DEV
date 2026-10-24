#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StormCheckpoint.generated.h"

class UArrowComponent;
class UBoxComponent;

/**
 * Walking into the box makes this the respawn point (checkpoints only move forward). The actor's
 * position is where Mara reappears (feet about 100 cm below it) and its rotation the way she
 * faces. Reaching it can set the objective.
 */
UCLASS()
class ITTAKESONE_API AStormCheckpoint : public AActor
{
	GENERATED_BODY()

public:
	AStormCheckpoint();

	UPROPERTY(VisibleAnywhere, Category = "Checkpoint")
	TObjectPtr<UBoxComponent> Trigger;

	UPROPERTY(VisibleAnywhere, Category = "Checkpoint")
	TObjectPtr<UArrowComponent> Facing;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Checkpoint")
	int32 Order = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Checkpoint")
	FString Label;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Checkpoint")
	FString Objective;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Checkpoint")
	FVector Extent = FVector(150.f, 200.f, 150.f);

	FVector GetSpawnLocation() const { return GetActorLocation(); }

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;

private:
	UFUNCTION()
	void OnEnter(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep);
};
