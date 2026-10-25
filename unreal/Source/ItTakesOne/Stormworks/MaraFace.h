#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "MaraFace.generated.h"

class UCableComponent;
class USkeletalMeshComponent;
class UStaticMeshComponent;

UENUM(BlueprintType)
enum class EMaraMood : uint8
{
	Neutral,
	/** Hauling a machine, running the collapsing catwalk: lids lower, brows down and in. */
	Determined,
	/** The storm engine waking, a fall: lids wide, brows up. */
	Surprised,
	/** The toy, the roof: smiling eyes, brows a little up. */
	Happy,
};

/**
 * Mara's living face and scarf, ported from the web game (ToyHero.ts, Scarf.ts):
 *
 * - her eyes turn in their sockets toward what matters (the ring she aims at, the toy, a note, the
 *   lighthouse in a shot), and glance about when nothing does;
 * - she blinks every 2 to 6 seconds (the catch-lights go while the lids are shut);
 * - lids and brows take a pose for her mood, which follows the game (hauling, the catwalk, the
 *   engine waking, a fall, the toy, the roof);
 * - her scarf's two tails are short simulated cables that trail and catch the storm's wind.
 *
 * The face parts are the rigid parts UMaraAnimInstance::Dress put on her head bone, recognised by
 * their shape (eyes are spheres, catch-lights are tiny, brows above the eyes, the mouth below);
 * this component re-hangs them on pivots so they can turn about their own centres.
 */
UCLASS(ClassGroup = (ItTakesOne))
class ITTAKESONE_API UMaraFace : public UActorComponent
{
	GENERATED_BODY()

public:
	UMaraFace();

	/** Finds the face among her rigid parts and builds the pivots and the scarf's tails. */
	bool Setup(USkeletalMeshComponent* Body, const TArray<UStaticMeshComponent*>& RigidParts);

	EMaraMood GetMood() const { return Mood; }
	/** 0 open .. 1 shut. */
	float GetLidClosure() const { return Closure; }
	bool HasLookTarget() const { return bLooking; }

	/** For the self-test's pictures: blink now. */
	void BlinkNow() { Blink = 1.f; }

	// Read and set by the self-test.
	int32 Blinks = 0;
	/** Every mood shown so far, one bit each. */
	uint8 MoodsSeen = 0;
	/** 0..1 holds the lids there (for a picture); negative lets them live. */
	float ForceClosure = -1.f;
	int32 Eyes = 0;
	int32 Tails = 0;

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	struct FEye
	{
		USceneComponent* Ball = nullptr;
		USceneComponent* Lid = nullptr;
		UStaticMeshComponent* Glint = nullptr;
		FVector Center = FVector::ZeroVector;
	};
	struct FBrow
	{
		USceneComponent* Pivot = nullptr;
		float Side = 1.f;
	};

	USceneComponent* MakePivot(USkeletalMeshComponent* Body, FName Bone, const FVector& ModelCenter, const TCHAR* Name);
	void Hang(UStaticMeshComponent* Part, USceneComponent* Pivot, const FVector& ModelCenter);
	EMaraMood ChooseMood() const;
	bool ChooseLookTarget(FVector& Out) const;

	TArray<FEye> EyesList;
	TArray<FBrow> Brows;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UCableComponent>> ScarfTails;

	EMaraMood Mood = EMaraMood::Neutral;
	float LidSign = 1.f;
	float Lid = 0.f;
	float Closure = 0.f;
	float Blink = 0.f;
	float NextBlink = 2.5f;
	float BrowLift = 0.f;
	float BrowTilt = 0.f;
	FVector2D Look = FVector2D::ZeroVector;
	FVector2D Wander = FVector2D::ZeroVector;
	float NextWander = 1.f;
	bool bLooking = false;
	float Time = 0.f;
};
