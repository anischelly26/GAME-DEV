#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HouseDetail.generated.h"

class UStaticMeshComponent;
class UTextRenderComponent;

UENUM(BlueprintType)
enum class EHouseDetailKind : uint8
{
	/** Ivo's brass gauge on the workbench: E looks at it; Nacre steals it; Nacre gives it back. */
	Gauge,
	/** Something funny: the kettle's steam bends toward the drain, as if being sniffed. */
	Kettle,
	/** Something comforting: Mara's childhood heights, pencilled on the doorframe. */
	HeightMarks,
	/** Something subtly wrong: the water in a glass climbs its side and spills toward the drain. */
	WaterGlass,
};

/**
 * One of the house's small things. The three details (kettle, marks, glass) play once when Mara
 * comes within reach and looks at them for a moment; none is required. The gauge is the object
 * the story turns on: it is inspected with E, carried off by a tentacle and handed back later.
 */
UCLASS()
class ITTAKESONE_API AHouseDetail : public AActor
{
	GENERATED_BODY()

public:
	AHouseDetail();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "House")
	EHouseDetailKind Kind = EHouseDetailKind::Gauge;

	/** Where the drain is (world): the steam and the water lean that way. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "House")
	FVector DrainLocation = FVector::ZeroVector;

	/** How close she must be, and how long she must look, for it to play (cm, s). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "House")
	float Reach = 260.f;

	UPROPERTY(VisibleAnywhere, Category = "House")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "House")
	TObjectPtr<UStaticMeshComponent> PartA;

	UPROPERTY(VisibleAnywhere, Category = "House")
	TObjectPtr<UStaticMeshComponent> PartB;

	UPROPERTY(VisibleAnywhere, Category = "House")
	TObjectPtr<UStaticMeshComponent> PartC;

	UPROPERTY(VisibleAnywhere, Category = "House")
	TObjectPtr<UTextRenderComponent> Label;

	/** The steam puffs, or the drops from the glass. */
	UPROPERTY(VisibleAnywhere, Category = "House")
	TArray<TObjectPtr<UStaticMeshComponent>> Puffs;

	bool HasPlayed() const { return bPlayed; }
	/** Plays it now (the house director calls this when she has looked at it). */
	void Play();
	/** The gauge: the needle swings to point at the floor. */
	void TwitchNeedle() { NeedleWant = 1.f; }

	/** Whether she is close and facing it (the camera's view), for the director. */
	bool IsLookedAtBy(const class APlayerController* PC, float MaxDegrees = 30.f) const;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	bool bPlayed = false;
	float T = -1.f;
	float Time = 0.f;
	float Needle = 0.f;
	float NeedleWant = 0.f;
};
