#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "LighthouseBeam.generated.h"

class UPointLightComponent;
class USpotLightComponent;
class UStaticMeshComponent;

/**
 * The lighthouse on Knoll Rock, burning when it should be dark: a warm lamp and two beams turning
 * slowly through the storm (visible in the fog's volumetric scattering). The destination, seen
 * from the first room and framed again at the end.
 */
UCLASS()
class ITTAKESONE_API ALighthouseBeam : public AActor
{
	GENERATED_BODY()

public:
	ALighthouseBeam();

	UPROPERTY(VisibleAnywhere, Category = "Lighthouse")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "Lighthouse")
	TObjectPtr<USceneComponent> Turn;

	UPROPERTY(VisibleAnywhere, Category = "Lighthouse")
	TObjectPtr<UStaticMeshComponent> Lens;

	UPROPERTY(VisibleAnywhere, Category = "Lighthouse")
	TObjectPtr<USpotLightComponent> BeamA;

	UPROPERTY(VisibleAnywhere, Category = "Lighthouse")
	TObjectPtr<USpotLightComponent> BeamB;

	UPROPERTY(VisibleAnywhere, Category = "Lighthouse")
	TObjectPtr<UPointLightComponent> Lamp;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Lighthouse")
	float DegreesPerSecond = 24.f;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;
};
