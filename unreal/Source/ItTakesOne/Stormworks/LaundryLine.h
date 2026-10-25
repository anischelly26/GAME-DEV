#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "LaundryLine.generated.h"

class UStaticMeshComponent;

/**
 * The prisoners' washing, pegged along the seawall gallery: sheets, shirts and towels in faded
 * colours on a rope, flapping in the storm. Each piece swings about the rope on a damped spring
 * toward where the wind pushes it (gusts come and go), and flaps up when Mara brushes past. It sits
 * against the wall, above her head; nothing collides.
 */
UCLASS()
class ITTAKESONE_API ALaundryLine : public AActor
{
	GENERATED_BODY()

public:
	ALaundryLine();

	UPROPERTY(VisibleAnywhere, Category = "Laundry")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "Laundry")
	TObjectPtr<UStaticMeshComponent> Rope;

	/** Along the actor's X axis (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Laundry")
	float Length = 1200.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Laundry")
	int32 Seed = 7;

	/** The side the wind pushes the washing toward: +1 swings the hems toward +Y. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Laundry")
	float WindSide = -1.f;

	/** The piece nearest a point, and its swing (degrees); for the self-test. */
	float SwingNear(const FVector& Where) const;
	int32 Brushes = 0;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	struct FPiece
	{
		USceneComponent* Hinge = nullptr;
		float Angle = 0.f;
		float Speed = 0.f;
		float Phase = 0.f;
		float Rate = 1.f;
		float Width = 80.f;
		float NearT = -10.f;
	};
	TArray<FPiece> Pieces;
	float Time = 0.f;
};
