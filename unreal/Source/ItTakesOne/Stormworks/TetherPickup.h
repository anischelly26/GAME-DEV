#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TetherPickup.generated.h"

class UPointLightComponent;
class USphereComponent;
class UStaticMeshComponent;

/** Ivo's maintenance tether, left on his workbench for Mara. Walking up to it picks it up. */
UCLASS()
class ITTAKESONE_API ATetherPickup : public AActor
{
	GENERATED_BODY()

public:
	ATetherPickup();

	UPROPERTY(VisibleAnywhere, Category = "Pickup")
	TObjectPtr<USphereComponent> Trigger;

	UPROPERTY(VisibleAnywhere, Category = "Pickup")
	TObjectPtr<USceneComponent> Model;

	UPROPERTY(VisibleAnywhere, Category = "Pickup")
	TObjectPtr<UStaticMeshComponent> Canister;

	UPROPERTY(VisibleAnywhere, Category = "Pickup")
	TObjectPtr<UStaticMeshComponent> Coil;

	UPROPERTY(VisibleAnywhere, Category = "Pickup")
	TObjectPtr<UStaticMeshComponent> Hook;

	UPROPERTY(VisibleAnywhere, Category = "Pickup")
	TObjectPtr<UPointLightComponent> Glow;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Pickup")
	FString Objective = TEXT("Pull the crate off the door");

	bool bTaken = false;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UFUNCTION()
	void OnEnter(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep);

	float Time = 0.f;
};
