#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TetherPoint.generated.h"

class ATetherMovable;
class UMaterialInstanceDynamic;
class UPointLightComponent;
class UStaticMeshComponent;

UENUM(BlueprintType)
enum class ETetherPointKind : uint8
{
	/** Mara is carried across to it and set down at its landing spot. */
	Anchor,
	/** A tug runs the machine it is mounted on to the other end of its track. */
	Pull,
};

/**
 * A brass ring the maintenance tether can latch onto. Every ring in the prison looks the same and
 * glows the same accent colour, so the player learns one rule: teal ring = the tether works here.
 * The ring brightens when it is the current target, and dims to a faint glow when it is in view but
 * out of reach.
 */
UCLASS()
class ITTAKESONE_API ATetherPoint : public AActor
{
	GENERATED_BODY()

public:
	ATetherPoint();

	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<UStaticMeshComponent> Ring;

	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<UStaticMeshComponent> Core;

	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<UStaticMeshComponent> Bracket;

	UPROPERTY(VisibleAnywhere, Category = "Tether")
	TObjectPtr<UPointLightComponent> Glow;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	ETetherPointKind Kind = ETetherPointKind::Anchor;

	/** Anchor: where Mara's feet land, relative to the ring (in the ring's frame). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether", meta = (MakeEditWidget = true))
	FVector LandingOffset = FVector(0.f, 0.f, -300.f);

	/** Pull: the machine this ring is mounted on (the ring rides along with it). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	TObjectPtr<ATetherMovable> Movable;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	bool bEnabled = true;

	/** Where the cable latches (world). */
	FVector GetAttachLocation() const;

	/** Anchor: where Mara's feet are set down (world). */
	FVector GetLandingLocation() const;

	/** 0 idle, 1 in view but out of reach, 2 targeted, 3 latched. */
	void SetHighlight(int32 Level);

	/** A short flash when the tether latches or a tug is refused. */
	void Pulse(float Strength = 1.f);

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY(Transient)
	TObjectPtr<UMaterialInstanceDynamic> CoreMID;

	int32 Highlight = 0;
	float Shown = 0.f;
	float PulseAmount = 0.f;
	float Time = 0.f;
};
