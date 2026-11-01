#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "NacreMantle.generated.h"

class UMaterialInterface;
class UProceduralMeshComponent;
struct FProcMeshTangent;

/**
 * Nacre's body: a lathed octopus mantle (a broad head at the eyes, a neck, the great bulb above it)
 * that breathes slowly. It is only ever a shape: dark, against the light, or in the dark.
 */
UCLASS()
class ITTAKESONE_API ANacreMantle : public AActor
{
	GENERATED_BODY()

public:
	ANacreMantle();

	UPROPERTY(VisibleAnywhere, Category = "Nacre")
	TObjectPtr<UProceduralMeshComponent> Mantle;

	/** Radius of the head (cm); the mantle above is built from it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	float Radius = 240.f;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void Build(float Breath);

	float Time = 0.f;
	bool bMade = false;
};
