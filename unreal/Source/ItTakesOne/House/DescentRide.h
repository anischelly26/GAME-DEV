#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "DescentRide.generated.h"

class AMaraCharacter;
class ANacreTentacle;
class USplineComponent;

/**
 * Nacre's tow down through the house: the hallway stretches, doors float loose, and the house folds
 * into the flooded passages. Mara is carried along a fixed path (the spline) at a speed that rises
 * and falls; the player steers her within a tube around it (WASD or the left stick: left, right,
 * up, down). Floating doors, chairs and frames along the way nudge her aside with a soft knock:
 * there is no way to fail, it teaches steering in the water while something astonishing happens.
 * The camera follows the path ahead.
 */
UCLASS()
class ITTAKESONE_API ADescentRide : public AActor
{
	GENERATED_BODY()

public:
	ADescentRide();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Descent")
	TObjectPtr<USplineComponent> Path;

	/** Things in the way (the builder lists them); each knocks her aside once per pass. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Descent")
	TArray<TObjectPtr<AActor>> Obstacles;

	/** The tentacle that tows her, its base kept ahead of her along the path. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Descent")
	TObjectPtr<ANacreTentacle> Tow;

	/** From here on the passage is flooded (distance along the path, cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Descent")
	float FloodedFrom = 1600.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Descent")
	float Radius = 140.f;

	void Begin(AMaraCharacter* Who);
	/** How far off the path she is steered now (cm; X right, Y up), for the self-test. */
	FVector2D GetOffset() const { return Offset; }
	bool IsRunning() const { return bRunning; }
	bool IsFinished() const { return bFinished; }
	bool IsFlooded() const { return bRunning && Distance > FloodedFrom; }
	float GetProgress() const;

	DECLARE_MULTICAST_DELEGATE(FOnFinished);
	FOnFinished OnFinished;

	// Read by the self-test.
	int32 Bumps = 0;
	float SteerTravel = 0.f;

	virtual void Tick(float DeltaSeconds) override;

private:
	TWeakObjectPtr<AMaraCharacter> Rider;
	bool bRunning = false;
	bool bFinished = false;
	float Distance = 0.f;
	/** Her right, carried along the path; see Tick. */
	FVector SteerRight = FVector::ZeroVector;
	FVector2D Offset = FVector2D::ZeroVector;
	TSet<TWeakObjectPtr<AActor>> Hit;
};
