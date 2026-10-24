#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StormRain.generated.h"

class UInstancedStaticMeshComponent;

/**
 * Wind-driven rain around the camera: thin translucent streaks, one instanced mesh, moved each
 * frame (no particle system asset needed). Streaks that leave the box around the camera wrap
 * round, so it rains wherever she goes.
 */
UCLASS()
class ITTAKESONE_API AStormRain : public AActor
{
	GENERATED_BODY()

public:
	AStormRain();

	UPROPERTY(VisibleAnywhere, Category = "Rain")
	TObjectPtr<UInstancedStaticMeshComponent> Streaks;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rain")
	int32 Count = 700;

	/** Half-size of the box round the camera (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rain")
	FVector Extent = FVector(1600.f, 1600.f, 900.f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rain")
	FVector Velocity = FVector(-350.f, 520.f, -2300.f);

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	TArray<FVector> Offsets;
	TArray<FTransform> Transforms;
};
