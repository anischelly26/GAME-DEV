#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TetherMovable.generated.h"

class UStaticMeshComponent;

/**
 * A heavy machine on a straight track: a cargo crate on a girder, a breaker handle, a sluice gate.
 * A tug on its ring (or a call from the storm director) runs it to the other end of its track,
 * eased in and out, grinding all the way and landing with a clunk. Its body is solid, so Mara can
 * stand on it, and it carries her if it moves while she does. Predictable on purpose: no physics.
 */
UCLASS()
class ITTAKESONE_API ATetherMovable : public AActor
{
	GENERATED_BODY()

public:
	ATetherMovable();

	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<USceneComponent> Root;

	/** The part that moves (a cube scaled to BodySize). */
	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<UStaticMeshComponent> Body;

	/** The visible track, from the start to the end position. */
	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<UStaticMeshComponent> Rail;

	/** Where the body ends up, relative to where it starts. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether", meta = (MakeEditWidget = true))
	FVector TrackEnd = FVector(400.f, 0.f, 0.f);

	/** Body size in cm. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	FVector BodySize = FVector(200.f, 200.f, 140.f);

	/** Rail offset below the body's centre (cm), and its thickness. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	float RailDrop = 90.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	float Speed = 280.f;

	/** Stays at the end once it gets there (a lever that engages). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	bool bOneWay = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	bool bShowRail = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	FName BodyMaterial = TEXT("MI_TOS_Crate");

	/** Sound while moving (the gate is louder and slower than a crate). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	FName MoveSound = TEXT("S_TOS_Grind");

	/** 0 at the start, 1 at the end. */
	UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category = "Tether")
	float Alpha = 0.f;

	/** Times it has arrived at an end (tests read it). */
	UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category = "Tether")
	int32 Arrivals = 0;

	bool IsMoving() const { return MoveT >= 0.f; }
	bool IsAtEnd() const { return !IsMoving() && Alpha > 0.999f; }

	/** Run to the other end. False if it is moving already, or engaged for good. */
	bool Tug();

	/** Back to the start at once (restarting a section). */
	void ResetToStart();

	DECLARE_MULTICAST_DELEGATE_OneParam(FOnArrived, ATetherMovable*);
	FOnArrived OnArrived;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void Apply();

	float From = 0.f;
	float To = 0.f;
	float MoveT = -1.f;
	float MoveDuration = 1.f;
};
